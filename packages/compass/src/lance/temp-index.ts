import * as lancedb from "@lancedb/lancedb";
import { join } from "node:path";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { getLanceBasePath } from "./connection";
import { createHash } from "node:crypto";
import type { EmbeddingRecord, HybridSearchResponse } from "./embeddings";
import { hybridSearch } from "./embeddings";

const TEMP_PREFIX = "temp-";
const TABLE_NAME = "embeddings";

const tempConnections = new Map<string, lancedb.Connection>();
const tempPaths = new Set<string>();

function hashPath(path: string): string {
  return createHash("md5").update(path).digest("hex").slice(0, 12);
}

function getTempId(path: string): string {
  return `${TEMP_PREFIX}${hashPath(path)}`;
}

export async function getTempLanceDb(path: string): Promise<{ db: lancedb.Connection; tempId: string }> {
  const tempId = getTempId(path);
  const basePath = getLanceBasePath();
  const tempPath = join(basePath, tempId);
  
  if (!existsSync(tempPath)) {
    mkdirSync(tempPath, { recursive: true });
  }
  
  if (tempConnections.has(tempPath)) {
    return { db: tempConnections.get(tempPath)!, tempId };
  }
  
  const db = await lancedb.connect(tempPath);
  tempConnections.set(tempPath, db);
  tempPaths.add(tempPath);
  
  return { db, tempId };
}

export async function upsertTempEmbeddings(path: string, records: EmbeddingRecord[]): Promise<string> {
  if (records.length === 0) return getTempId(path);
  
  const { db, tempId } = await getTempLanceDb(path);
  const tableNames = await db.tableNames();
  
  const cleanRecords = records.map(r => {
    const clean: Record<string, unknown> = {
      file_path: r.file_path,
      chunk_index: r.chunk_index,
      chunk_start: r.chunk_start,
      chunk_end: r.chunk_end,
      content: r.content,
      vector: r.vector,
    };
    if (r.symbol !== undefined) clean.symbol = r.symbol;
    if (r.scope_chain !== undefined) clean.scope_chain = r.scope_chain;
    if (r.contextualized_content !== undefined) clean.contextualized_content = r.contextualized_content;
    return clean;
  });
  
  if (tableNames.includes(TABLE_NAME)) {
    const table = await db.openTable(TABLE_NAME);
    await table.add(cleanRecords);
  } else {
    await db.createTable(TABLE_NAME, cleanRecords);
  }
  
  return tempId;
}

export async function searchTempIndex(
  path: string, 
  queryVector: number[], 
  options: { limit?: number; focus?: string }
): Promise<HybridSearchResponse> {
  const { db } = await getTempLanceDb(path);
  const tableNames = await db.tableNames();
  
  if (!tableNames.includes(TABLE_NAME)) {
    return { results: [], searchType: "vector-only", ftsIndexed: false };
  }
  
  const table = await db.openTable(TABLE_NAME);
  
  let results = await table
    .vectorSearch(queryVector)
    .limit(options.limit ?? 10)
    .toArray();
  
  return {
    results: results.map(r => ({
      file_path: r.file_path as string,
      chunk_index: r.chunk_index as number,
      chunk_start: r.chunk_start as number,
      chunk_end: r.chunk_end as number,
      content: r.content as string,
      vector: r.vector as number[],
      symbol: r.symbol as string | undefined,
      scope_chain: r.scope_chain as string | undefined,
      contextualized_content: r.contextualized_content as string | undefined,
      _score: r._distance as number | undefined,
    })),
    searchType: "vector-only",
    ftsIndexed: false,
  };
}

export function isTempIndexed(path: string): boolean {
  const tempId = getTempId(path);
  const basePath = getLanceBasePath();
  const tempPath = join(basePath, tempId);
  return existsSync(tempPath);
}

export function cleanupTempIndex(path: string): void {
  const tempId = getTempId(path);
  const basePath = getLanceBasePath();
  const tempPath = join(basePath, tempId);
  
  if (existsSync(tempPath)) {
    rmSync(tempPath, { recursive: true, force: true });
  }
  tempConnections.delete(tempPath);
  tempPaths.delete(tempPath);
}

export function cleanupAllTempIndexes(): void {
  const basePath = getLanceBasePath();
  
  for (const tempPath of tempPaths) {
    if (existsSync(tempPath)) {
      rmSync(tempPath, { recursive: true, force: true });
    }
    tempConnections.delete(tempPath);
  }
  tempPaths.clear();
  
  // Also cleanup any orphaned temp directories
  if (existsSync(basePath)) {
    const { readdirSync } = require("node:fs");
    const entries = readdirSync(basePath);
    for (const entry of entries) {
      if (entry.startsWith(TEMP_PREFIX)) {
        const fullPath = join(basePath, entry);
        rmSync(fullPath, { recursive: true, force: true });
      }
    }
  }
}

export function getTempIndexStats(path: string): { exists: boolean; tempId: string } {
  const tempId = getTempId(path);
  return { exists: isTempIndexed(path), tempId };
}
