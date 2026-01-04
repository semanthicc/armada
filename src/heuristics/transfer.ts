import { getDb } from "../db";
import type { SemanthiccContext } from "../context";
import { addMemory, listMemories, DuplicateMemoryError } from "./repository";
import type { Memory, ConceptType } from "../types";

function getLegacyContext(): SemanthiccContext {
  return { db: getDb() };
}

export interface ExportMemory {
  content: string;
  concept_type: string;
  domain: string | null;
  confidence: number;
}

export interface ImportResult {
  added: number;
  skipped: number;
  errors: string[];
}

export function exportMemories(
  ctxOrProjectId: SemanthiccContext | number | null,
  projectId?: number | null
): string {
  let ctx: SemanthiccContext;
  let pid: number | null;

  if (ctxOrProjectId === null || typeof ctxOrProjectId === "number") {
    ctx = getLegacyContext();
    pid = ctxOrProjectId;
  } else {
    ctx = ctxOrProjectId;
    pid = projectId ?? null;
  }

  const memories = listMemories(ctx, {
    projectId: pid,
    includeGlobal: false,
    limit: 1000,
    conceptTypes: ["pattern", "rule", "constraint", "decision", "context"],
  });

  const exportData: ExportMemory[] = memories.map(m => ({
    content: m.content,
    concept_type: m.concept_type,
    domain: m.domain,
    confidence: m.confidence,
  }));

  return JSON.stringify(exportData, null, 2);
}

export function importMemories(
  ctxOrProjectId: SemanthiccContext | number | null,
  projectIdOrJson: number | null | string,
  json?: string
): ImportResult {
  let ctx: SemanthiccContext;
  let pid: number | null;
  let data: string;

  if (ctxOrProjectId === null || typeof ctxOrProjectId === "number") {
    ctx = getLegacyContext();
    pid = ctxOrProjectId;
    data = projectIdOrJson as string;
  } else {
    ctx = ctxOrProjectId;
    pid = projectIdOrJson as number | null;
    data = json!;
  }

  const result: ImportResult = {
    added: 0,
    skipped: 0,
    errors: [],
  };

  let memories: ExportMemory[];
  try {
    memories = JSON.parse(data);
  } catch (e) {
    result.errors.push("Invalid JSON format");
    return result;
  }

  if (!Array.isArray(memories)) {
    result.errors.push("JSON must be an array of memories");
    return result;
  }

  for (const item of memories) {
    if (!item.content || !item.concept_type) {
      result.errors.push(`Skipping invalid item: ${JSON.stringify(item)}`);
      continue;
    }

    try {
      const memory = addMemory(ctx, {
        project_id: pid,
        content: item.content,
        concept_type: item.concept_type as ConceptType,
        domain: item.domain ?? undefined,
        source: "explicit",
      });
      
      if (item.confidence && item.confidence !== 0.5) {
        ctx.db.run("UPDATE memories SET confidence = ? WHERE id = ?", [item.confidence, memory.id]);
      }
      result.added++;
    } catch (e) {
      if (e instanceof DuplicateMemoryError) {
        result.skipped++;
      } else {
        result.errors.push(`Error adding memory: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  
  return result;
}
