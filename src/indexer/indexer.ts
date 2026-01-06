import { readFileSync } from "node:fs";
import pLimit from "p-limit";
import { getDb } from "../db";
import type { SemanthiccContext } from "../context";
import { registerProject } from "../hooks/project-detect";
import { embedText, saveEmbeddingConfig } from "../embeddings";
import { loadGlobalConfig } from "../config";
import { walkProject } from "./walker";
import { splitIntoChunks } from "./chunker";
import { splitIntoAstChunks, isAstChunkable, isAstChunk, type AstChunk } from "./ast-chunker";
import { hashFile } from "./hasher";
import { upsertEmbeddings, deleteFileEmbeddings, getEmbeddingStats, type EmbeddingRecord } from "../lance/embeddings";
import { upsertTempEmbeddings } from "../lance/temp-index";
import { getFileHash, updateFileHash, getAllFileHashes, deleteFileHash } from "../lance/file-tracker";
import type { Chunk } from "./chunker";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 30000;
const EMBEDDING_CONCURRENCY = 5;

class CircuitBreaker {
  private consecutiveFailures = 0;
  private openUntil = 0;
  private sleeper: (ms: number) => Promise<void>;

  constructor(sleeper?: (ms: number) => Promise<void>) {
    this.sleeper = sleeper || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (Date.now() < this.openUntil) {
      const waitTime = this.openUntil - Date.now();
      console.log(`[circuit-breaker] Open, waiting ${Math.ceil(waitTime / 1000)}s before retry`);
      await this.sleeper(waitTime);
    }

    try {
      const result = await fn();
      this.consecutiveFailures = 0;
      return result;
    } catch (error) {
      this.consecutiveFailures++;
      
      if (this.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        this.openUntil = Date.now() + CIRCUIT_BREAKER_RESET_MS;
        console.log(`[circuit-breaker] Opened after ${this.consecutiveFailures} failures, pausing for 30s`);
        this.consecutiveFailures = 0;
      }
      
      throw error;
    }
  }

  reset() {
    this.consecutiveFailures = 0;
    this.openUntil = 0;
  }
  
  // For testing only - replace sleeper dynamically
  setSleeper(sleeper: (ms: number) => Promise<void>) {
    this.sleeper = sleeper;
  }
}

const embeddingCircuitBreaker = new CircuitBreaker();

export function resetCircuitBreaker() {
  embeddingCircuitBreaker.reset();
  embeddingCircuitBreaker.setSleeper((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  retrySleeper = (ms) => new Promise(resolve => setTimeout(resolve, ms));
}

let retrySleeper: (ms: number) => Promise<void> = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function setCircuitBreakerTestMode(enabled: boolean) {
  if (enabled) {
    embeddingCircuitBreaker.setSleeper(() => Promise.resolve());
    retrySleeper = () => Promise.resolve();
  } else {
    embeddingCircuitBreaker.setSleeper((ms) => new Promise(resolve => setTimeout(resolve, ms)));
    retrySleeper = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  }
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delayMs = RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await embeddingCircuitBreaker.execute(fn);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < retries) {
        const jitter = 1 + Math.random() * 0.3;
        const delay = delayMs * Math.pow(2, attempt) * jitter;
        await retrySleeper(delay);
      }
    }
  }
  
  throw lastError;
}

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
  errorCount?: number;
  errors?: Array<{ file: string; error: string }>;
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
  const errors: Array<{ file: string; error: string }> = [];
  
  // Track files in current batch for transactional hash updates
  let batch: EmbeddingRecord[] = [];
  let batchFileHashes: Map<string, string> = new Map();
  const BATCH_SIZE_CHUNKS = 100;
  
  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) {
      if (batch.length > 0) {
        try {
          await upsertEmbeddings(project.id, batch);
          for (const [path, hash] of batchFileHashes) {
            updateFileHash(ctx, project.id, path, hash);
          }
        } catch (e) {
          // Best effort on abort
        }
      }
      throw new Error("Indexing aborted");
    }

    const file = files[i]!;
    processedFiles.add(file.relativePath);
    
    const currentHash = hashFile(file.absolutePath);
    const storedHash = existingHashes.get(file.relativePath);
    
    if (storedHash === currentHash) {
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
    
    let astChunks = null;
    if (isAstChunkable(file.relativePath)) {
      astChunks = await splitIntoAstChunks(file.absolutePath, content);
    }
    
    const chunks = astChunks ?? splitIntoChunks(content);
    
    const validChunks = chunks.filter(chunk => {
      const text = isAstChunk(chunk) ? chunk.contextualizedText : chunk.content;
      return text && text.trim().length > 0;
    });
    
    if (validChunks.length === 0) continue;
    
    const limit = pLimit(EMBEDDING_CONCURRENCY);
    const embeddingResults = await Promise.allSettled(
      validChunks.map(chunk => 
        limit(async () => {
          const text = isAstChunk(chunk) ? chunk.contextualizedText : chunk.content;
          const embedding = await withRetry(() => embedText(text));
          return { chunk, embedding };
        })
      )
    );
    
    let fileSuccess = true;
    for (const result of embeddingResults) {
      if (result.status === "rejected") {
        const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        errors.push({ file: file.relativePath, error: errorMsg });
        fileSuccess = false;
        break;
      }
      
      const { chunk, embedding } = result.value;
      batch.push({
        file_path: file.relativePath.replace(/\\/g, '/'),
        chunk_index: chunk.index,
        chunk_start: chunk.startLine,
        chunk_end: chunk.endLine,
        content: chunk.content,
        vector: Array.from(embedding),
        symbol: chunk.symbol,
        scope_chain: isAstChunk(chunk) ? chunk.scopeChain : undefined,
        contextualized_content: isAstChunk(chunk) ? chunk.contextualizedText : undefined,
      });
      
      totalChunks++;
    }
    
    if (fileSuccess) {
      batchFileHashes.set(file.relativePath, currentHash);
    }
    
    if (batch.length >= BATCH_SIZE_CHUNKS) {
      try {
        await upsertEmbeddings(project.id, batch);
        for (const [path, hash] of batchFileHashes) {
          updateFileHash(ctx, project.id, path, hash);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push({ file: "batch_upsert", error: errorMsg });
      }
      batch = [];
      batchFileHashes = new Map();
    }
  }
  
  if (batch.length > 0) {
    try {
      await upsertEmbeddings(project.id, batch);
      for (const [path, hash] of batchFileHashes) {
        updateFileHash(ctx, project.id, path, hash);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push({ file: "batch_upsert", error: errorMsg });
    }
  }
  
  for (const [path, _] of existingHashes) {
    if (!processedFiles.has(path)) {
      await deleteFileEmbeddings(project.id, path);
      deleteFileHash(ctx, project.id, path);
    }
  }
  
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
    errorCount: errors.length,
    errors: errors.length > 0 ? errors : undefined,
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

  const stats = await getEmbeddingStats(id);
  
  const fileCount = ctx.db.query("SELECT COUNT(*) as count FROM file_hashes WHERE project_id = ?").get(id) as { count: number };
  
  const project = ctx.db.query("SELECT last_indexed_at FROM projects WHERE id = ?").get(id) as { last_indexed_at: number | null } | null;
  
  return {
    chunkCount: stats.chunkCount,
    fileCount: fileCount.count,
    staleCount: 0,
    lastIndexedAt: project?.last_indexed_at ?? null,
  };
}

export interface TempIndexResult {
  path: string;
  tempId: string;
  filesIndexed: number;
  chunksCreated: number;
  durationMs: number;
  errorCount: number;
  errors?: Array<{ file: string; error: string }>;
}

export async function indexTempPath(targetPath: string): Promise<TempIndexResult> {
  const startTime = Date.now();
  let totalChunks = 0;
  const batch: EmbeddingRecord[] = [];
  const errors: Array<{ file: string; error: string }> = [];
  let filesIndexed = 0;
  
  embeddingCircuitBreaker.reset();
  
  for await (const file of walkProject(targetPath)) {
    filesIndexed++;
    
    let content: string;
    try {
      content = readFileSync(file.absolutePath, "utf-8");
    } catch (error) {
      errors.push({ file: file.relativePath, error: `Read error: ${error}` });
      continue;
    }
    
    let astChunks: AstChunk[] | null = null;
    if (isAstChunkable(file.relativePath)) {
      try {
        astChunks = await splitIntoAstChunks(content, file.relativePath);
      } catch {
        astChunks = null;
      }
    }
    
    const chunks = astChunks ?? splitIntoChunks(content);
    
    const validChunks = chunks.filter(chunk => {
      const text = isAstChunk(chunk) ? chunk.contextualizedText : chunk.content;
      return text && text.trim().length > 0;
    });
    
    if (validChunks.length === 0) continue;
    
    const limit = pLimit(EMBEDDING_CONCURRENCY);
    const embeddingResults = await Promise.allSettled(
      validChunks.map(chunk => 
        limit(async () => {
          const text = isAstChunk(chunk) ? chunk.contextualizedText : chunk.content;
          const embedding = await withRetry(() => embedText(text));
          return { chunk, embedding };
        })
      )
    );
    
    for (const result of embeddingResults) {
      if (result.status === "rejected") {
        const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        errors.push({ file: file.relativePath, error: errorMsg });
        break;
      }
      
      const { chunk, embedding } = result.value;
      batch.push({
        file_path: file.relativePath.replace(/\\/g, '/'),
        chunk_index: chunk.index,
        chunk_start: chunk.startLine,
        chunk_end: chunk.endLine,
        content: chunk.content,
        vector: Array.from(embedding),
        symbol: chunk.symbol,
        scope_chain: isAstChunk(chunk) ? chunk.scopeChain : undefined,
        contextualized_content: isAstChunk(chunk) ? chunk.contextualizedText : undefined,
      });
      
      totalChunks++;
    }
  }
  
  let tempId = "";
  if (batch.length > 0) {
    try {
      tempId = await upsertTempEmbeddings(targetPath, batch);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push({ file: "batch_upsert", error: errorMsg });
    }
  }
  
  return {
    path: targetPath,
    tempId,
    filesIndexed,
    chunksCreated: totalChunks,
    durationMs: Date.now() - startTime,
    errorCount: errors.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}
