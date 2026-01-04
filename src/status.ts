import { getDb } from "./db";
import type { SemanthiccContext } from "./context";

function getLegacyContext(): SemanthiccContext {
  return { db: getDb() };
}

export interface MemoryStats {
  total: number;
  golden: number;
  passive: number;
  avgConfidence: number;
  minConfidence: number;
  maxConfidence: number;
}

export interface TypeBreakdown {
  concept_type: string;
  count: number;
}

export interface IndexStats {
  chunkCount: number;
  lastIndexedAt: number | null;
}

export interface ProjectStatus {
  projectId: number | null;
  projectName: string | null;
  projectPath: string | null;
  memories: MemoryStats;
  typeBreakdown: TypeBreakdown[];
  index: IndexStats | null;
}

export function getStatus(
  ctxOrProjectId: SemanthiccContext | number | null,
  projectId?: number | null
): ProjectStatus {
  let ctx: SemanthiccContext;
  let pid: number | null;

  if (typeof ctxOrProjectId === "number" || ctxOrProjectId === null) {
    ctx = getLegacyContext();
    pid = ctxOrProjectId;
  } else {
    ctx = ctxOrProjectId;
    pid = projectId ?? null;
  }

  let projectName: string | null = null;
  let projectPath: string | null = null;
  let index: IndexStats | null = null;

  if (pid !== null) {
    const project = ctx.db.query("SELECT name, path, chunk_count, last_indexed_at FROM projects WHERE id = ?").get(pid) as {
      name: string | null;
      path: string;
      chunk_count: number;
      last_indexed_at: number | null;
    } | null;

    if (project) {
      projectName = project.name;
      projectPath = project.path;
      index = {
        chunkCount: project.chunk_count,
        lastIndexedAt: project.last_indexed_at,
      };
    }
  }

  const memoryStats = ctx.db.query(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN is_golden = 1 THEN 1 ELSE 0 END) as golden,
      SUM(CASE WHEN source = 'passive' THEN 1 ELSE 0 END) as passive,
      AVG(confidence) as avgConfidence,
      MIN(confidence) as minConfidence,
      MAX(confidence) as maxConfidence
    FROM memories
    WHERE status = 'current'
    AND (project_id = ? OR (? IS NULL AND project_id IS NULL) OR ? IS NULL)
  `).get(pid, pid, pid) as {
    total: number;
    golden: number;
    passive: number;
    avgConfidence: number | null;
    minConfidence: number | null;
    maxConfidence: number | null;
  };

  const typeBreakdown = ctx.db.query(`
    SELECT concept_type, COUNT(*) as count
    FROM memories
    WHERE status = 'current'
    AND (project_id = ? OR (? IS NULL AND project_id IS NULL) OR ? IS NULL)
    GROUP BY concept_type
    ORDER BY count DESC
  `).all(pid, pid, pid) as TypeBreakdown[];

  return {
    projectId: pid,
    projectName,
    projectPath,
    memories: {
      total: memoryStats.total || 0,
      golden: memoryStats.golden || 0,
      passive: memoryStats.passive || 0,
      avgConfidence: memoryStats.avgConfidence || 0,
      minConfidence: memoryStats.minConfidence || 0,
      maxConfidence: memoryStats.maxConfidence || 0,
    },
    typeBreakdown,
    index,
  };
}

export function formatStatus(status: ProjectStatus): string {
  const lines: string[] = [];

  if (status.projectPath) {
    lines.push(`Project: ${status.projectName || "unnamed"} (${status.projectPath})`);
  } else {
    lines.push("Project: Global (no project context)");
  }

  if (status.index) {
    const freshness = status.index.lastIndexedAt
      ? formatTimeSince(status.index.lastIndexedAt)
      : "never";
    const icon = status.index.lastIndexedAt && (Date.now() - status.index.lastIndexedAt < 24 * 60 * 60 * 1000) ? "✅" : "⚠️";
    lines.push(`Index: ${status.index.chunkCount} chunks | Last indexed: ${freshness} ${icon}`);
  } else {
    lines.push("Index: Not indexed");
  }

  const regular = status.memories.total - status.memories.golden - status.memories.passive;
  lines.push(`Memories: ${status.memories.total} total`);
  lines.push(`  ⭐ ${status.memories.golden} golden | ${regular} regular | ${status.memories.passive} passive`);

  if (status.typeBreakdown.length > 0) {
    const types = status.typeBreakdown.map(t => `${t.count} ${t.concept_type}s`).join(", ");
    lines.push(`  Types: ${types}`);
  }

  if (status.memories.total > 0) {
    lines.push(`  Confidence: avg ${status.memories.avgConfidence.toFixed(2)} | min ${status.memories.minConfidence.toFixed(2)} | max ${status.memories.maxConfidence.toFixed(2)}`);
  }

  return lines.join("\n");
}

function formatTimeSince(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}
