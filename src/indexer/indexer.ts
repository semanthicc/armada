import { readFileSync } from "node:fs";
import { getDb } from "../db";
import type { SemanthiccContext } from "../context";
import { registerProject } from "../hooks/project-detect";
import { embedText, embeddingToBuffer } from "../embeddings";
import { walkProject } from "./walker";
import { splitIntoChunks } from "./chunker";
import { hashFile } from "./hasher";

function getLegacyContext(): SemanthiccContext {
  return { db: getDb() };
}

export interface IndexProgress {
  totalFiles: number;
  processedFiles: number;
  totalChunks: number;
  currentFile: string;
}

export interface IndexResult {
  projectId: number;
  filesIndexed: number;
  chunksCreated: number;
  durationMs: number;
}

export interface IndexOptions {
  projectName?: string;
  maxFiles?: number;
  onProgress?: (progress: IndexProgress) => void;
}

export async function indexProject(
  ctxOrPath: SemanthiccContext | string,
  pathOrOptions?: string | IndexOptions,
  options?: IndexOptions
): Promise<IndexResult> {
  let ctx: SemanthiccContext;
  let projectPath: string;
  let opts: IndexOptions;

  if (typeof ctxOrPath === "string") {
    ctx = getLegacyContext();
    projectPath = ctxOrPath;
    opts = (pathOrOptions as IndexOptions) ?? {};
  } else {
    ctx = ctxOrPath;
    projectPath = pathOrOptions as string;
    opts = options ?? {};
  }

  const startTime = Date.now();
  const { projectName, maxFiles = 500, onProgress } = opts;
  
  const project = registerProject(ctx, projectPath, projectName);
  
  ctx.db.exec(`DELETE FROM embeddings WHERE project_id = ${project.id}`);
  
  const files = walkProject(projectPath, { maxFiles });
  
  const insertStmt = ctx.db.prepare(`
    INSERT INTO embeddings (project_id, file_path, file_hash, chunk_index, chunk_start, chunk_end, content, embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  let totalChunks = 0;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    
    onProgress?.({
      totalFiles: files.length,
      processedFiles: i,
      totalChunks,
      currentFile: file.relativePath,
    });
    
    let content: string;
    try {
      content = readFileSync(file.absolutePath, "utf-8");
    } catch {
      continue;
    }
    
    if (content.length > 100000) continue;
    
    const fileHash = hashFile(file.absolutePath);
    const chunks = splitIntoChunks(content);
    
    for (const chunk of chunks) {
      const embedding = await embedText(chunk.content);
      const embeddingBuffer = embeddingToBuffer(embedding);
      
      insertStmt.run(
        project.id,
        file.relativePath,
        fileHash,
        chunk.index,
        chunk.startLine,
        chunk.endLine,
        chunk.content,
        embeddingBuffer
      );
      
      totalChunks++;
    }
  }
  
  ctx.db.exec(`
    UPDATE projects 
    SET chunk_count = ${totalChunks}, last_indexed_at = ${Date.now()}, updated_at = ${Date.now()}
    WHERE id = ${project.id}
  `);
  
  return {
    projectId: project.id,
    filesIndexed: files.length,
    chunksCreated: totalChunks,
    durationMs: Date.now() - startTime,
  };
}

export function getIndexStats(
  ctxOrProjectId: SemanthiccContext | number,
  projectId?: number
): {
  chunkCount: number;
  fileCount: number;
  staleCount: number;
  lastIndexedAt: number | null;
} {
  const ctx = typeof projectId === "number" ? (ctxOrProjectId as SemanthiccContext) : getLegacyContext();
  const id = projectId ?? (ctxOrProjectId as number);

  const stats = ctx.db.query(`
    SELECT 
      COUNT(*) as chunkCount,
      COUNT(DISTINCT file_path) as fileCount,
      SUM(CASE WHEN is_stale = 1 THEN 1 ELSE 0 END) as staleCount
    FROM embeddings 
    WHERE project_id = ?
  `).get(id) as { chunkCount: number; fileCount: number; staleCount: number };
  
  const project = ctx.db.query("SELECT last_indexed_at FROM projects WHERE id = ?").get(id) as { last_indexed_at: number | null } | null;
  
  return {
    ...stats,
    lastIndexedAt: project?.last_indexed_at ?? null,
  };
}
