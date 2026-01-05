import { readFileSync } from "node:fs";
import { getDb } from "../db";
import type { SemanthiccContext } from "../context";
import { registerProject } from "../hooks/project-detect";
import { embedText, saveEmbeddingConfig } from "../embeddings";
import { loadGlobalConfig } from "../config";
import { walkProject } from "./walker";
import { splitIntoChunks } from "./chunker";
import { hashFile } from "./hasher";
import { upsertEmbeddings, deleteFileEmbeddings, getEmbeddingStats, type EmbeddingRecord } from "../lance/embeddings";
import { getFileHash, updateFileHash, getAllFileHashes, deleteFileHash } from "../lance/file-tracker";

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
  signal?: AbortSignal;
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
  const { projectName, maxFiles = 500, onProgress, signal } = opts;
  
  const project = registerProject(ctx, projectPath, projectName);
  const existingHashes = getAllFileHashes(ctx, project.id);
  const files = walkProject(projectPath, { maxFiles });
  
  let totalChunks = 0;
  const processedFiles = new Set<string>();
  
  // Process files in batches to reduce IO ops
  let batch: EmbeddingRecord[] = [];
  const BATCH_SIZE_CHUNKS = 100;
  
  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) {
      // Flush any pending batch before aborting to save progress
      if (batch.length > 0) {
        await upsertEmbeddings(project.id, batch);
      }
      throw new Error("Indexing aborted");
    }

    const file = files[i]!;
    processedFiles.add(file.relativePath);
    
    // Incremental check: Compare hash
    const currentHash = hashFile(file.absolutePath);
    const storedHash = existingHashes.get(file.relativePath);
    
    if (storedHash === currentHash) {
      // File unchanged, skip re-embedding
      continue;
    }
    
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
    
    const chunks = splitIntoChunks(content);
    
    // Add file chunks to batch
    // Note: We must ensure a file's chunks are never split across batches
    // to avoid the delete-before-insert logic deleting its own chunks.
    // Since we add ALL chunks of this file now, we are safe as long as we flush.
    
    for (const chunk of chunks) {
      const embedding = await embedText(chunk.content);
      
      batch.push({
        file_path: file.relativePath,
        chunk_index: chunk.index,
        chunk_start: chunk.startLine,
        chunk_end: chunk.endLine,
        content: chunk.content,
        vector: Array.from(embedding)
      });
      
      totalChunks++;
    }
    
    // Update hash record
    updateFileHash(ctx, project.id, file.relativePath, currentHash);
    
    // Flush batch if large enough
    if (batch.length >= BATCH_SIZE_CHUNKS) {
      await upsertEmbeddings(project.id, batch);
      batch = [];
    }
  }
  
  // Flush remaining
  if (batch.length > 0) {
    await upsertEmbeddings(project.id, batch);
  }
  
  // Handle deletions: Files in existingHashes but not in current walk
  for (const [path, _] of existingHashes) {
    if (!processedFiles.has(path)) {
      await deleteFileEmbeddings(project.id, path);
      deleteFileHash(ctx, project.id, path);
    }
  }
  
  // Update project stats
  const stats = await getEmbeddingStats(project.id);
  
  ctx.db.exec(`
    UPDATE projects 
    SET chunk_count = ${stats.chunkCount}, last_indexed_at = ${Date.now()}, updated_at = ${Date.now()}
    WHERE id = ${project.id}
  `);
  
  const embeddingConfig = loadGlobalConfig().embedding ?? { provider: "local" };
  saveEmbeddingConfig(project.id, embeddingConfig);
  
  return {
    projectId: project.id,
    filesIndexed: files.length,
    chunksCreated: totalChunks,
    durationMs: Date.now() - startTime,
  };
}

export async function getIndexStats(
  ctxOrProjectId: SemanthiccContext | number,
  projectId?: number
): Promise<{
  chunkCount: number;
  fileCount: number;
  staleCount: number;
  lastIndexedAt: number | null;
}> {
  const ctx = typeof projectId === "number" ? (ctxOrProjectId as SemanthiccContext) : getLegacyContext();
  const id = projectId ?? (ctxOrProjectId as number);

  // Get chunk count from LanceDB
  const stats = await getEmbeddingStats(id);
  
  // Get file count from SQLite hash tracker
  const fileCount = ctx.db.query("SELECT COUNT(*) as count FROM file_hashes WHERE project_id = ?").get(id) as { count: number };
  
  // Stale count is 0 in LanceDB model as we clean up immediately
  
  const project = ctx.db.query("SELECT last_indexed_at FROM projects WHERE id = ?").get(id) as { last_indexed_at: number | null } | null;
  
  return {
    chunkCount: stats.chunkCount,
    fileCount: fileCount.count,
    staleCount: 0,
    lastIndexedAt: project?.last_indexed_at ?? null,
  };
}
