import lancedb from "@lancedb/lancedb";
import { getLanceDb } from "./connection";
import type { Table } from "@lancedb/lancedb";

export interface EmbeddingRecord {
  file_path: string;
  chunk_index: number;
  chunk_start: number;
  chunk_end: number;
  content: string;
  vector: number[];
}

export interface HybridSearchResult extends EmbeddingRecord {
  _score?: number;
  _relevanceScore?: number;
}

export interface HybridSearchResponse {
  results: HybridSearchResult[];
  searchType: "hybrid" | "vector-only";
  ftsIndexed: boolean;
}

const TABLE_NAME = "embeddings";

async function getTable(projectId: number): Promise<Table> {
  const db = await getLanceDb(projectId);
  const tableNames = await db.tableNames();
  
  if (tableNames.includes(TABLE_NAME)) {
    return await db.openTable(TABLE_NAME);
  }
  
  throw new Error(`Table ${TABLE_NAME} does not exist. Call upsertEmbeddings first.`);
}

export async function upsertEmbeddings(projectId: number, records: EmbeddingRecord[]): Promise<void> {
  if (records.length === 0) return;
  
  const db = await getLanceDb(projectId);
  const tableNames = await db.tableNames();
  
  if (!tableNames.includes(TABLE_NAME)) {
    const table = await db.createTable(TABLE_NAME, records as unknown as Record<string, unknown>[]);
    await createFtsIndex(table);
    return;
  }
  
  const table = await db.openTable(TABLE_NAME);
  
  const files = [...new Set(records.map(r => r.file_path))];
  
  const filter = files.map(f => `file_path = '${f.replace(/'/g, "''")}'`).join(" OR ");
  
  if (filter) {
    await table.delete(filter);
  }
  
  await table.add(records as unknown as Record<string, unknown>[]);
}

async function createFtsIndex(table: Table): Promise<void> {
  try {
    await table.createIndex("content", {
      config: lancedb.Index.fts()
    });
  } catch {
    // FTS index may already exist
  }
}

export async function deleteFileEmbeddings(projectId: number, filePath: string): Promise<void> {
  const db = await getLanceDb(projectId);
  const tableNames = await db.tableNames();
  
  if (!tableNames.includes(TABLE_NAME)) return;
  
  const table = await db.openTable(TABLE_NAME);
  await table.delete(`file_path = '${filePath.replace(/'/g, "''")}'`);
}

export async function searchVectors(
  projectId: number, 
  queryVector: number[], 
  limit: number = 5,
  fileFilter?: "code" | "docs" | "all"
): Promise<EmbeddingRecord[]> {
  const db = await getLanceDb(projectId);
  const tableNames = await db.tableNames();
  
  if (!tableNames.includes(TABLE_NAME)) return [];
  
  const table = await db.openTable(TABLE_NAME);
  
  let query = table.vectorSearch(queryVector);
  
  if (fileFilter === "code") {
    query = query.where("file_path LIKE '%.ts' OR file_path LIKE '%.tsx' OR file_path LIKE '%.js' OR file_path LIKE '%.jsx' OR file_path LIKE '%.py' OR file_path LIKE '%.go' OR file_path LIKE '%.rs'");
  } else if (fileFilter === "docs") {
    query = query.where("file_path LIKE '%.md' OR file_path LIKE '%.txt' OR file_path LIKE '%.rst'");
  }
  
  const results = await query.limit(limit).toArray();
    
  return results as EmbeddingRecord[];
}

export async function getEmbeddingStats(projectId: number): Promise<{ chunkCount: number }> {
  const db = await getLanceDb(projectId);
  const tableNames = await db.tableNames();
  
  if (!tableNames.includes(TABLE_NAME)) return { chunkCount: 0 };
  
  const table = await db.openTable(TABLE_NAME);
  const count = await table.countRows();
  
  return { chunkCount: count };
}

export async function deleteAllEmbeddings(projectId: number): Promise<void> {
  const db = await getLanceDb(projectId);
  const tableNames = await db.tableNames();
  if (tableNames.includes(TABLE_NAME)) {
    await db.dropTable(TABLE_NAME);
  }
}

export async function hybridSearch(
  projectId: number,
  queryText: string,
  queryVector: number[],
  limit: number = 10,
  fileFilter?: "code" | "docs" | "all"
): Promise<HybridSearchResponse> {
  const db = await getLanceDb(projectId);
  const tableNames = await db.tableNames();
  
  if (!tableNames.includes(TABLE_NAME)) {
    return { results: [], searchType: "vector-only", ftsIndexed: false };
  }
  
  const table = await db.openTable(TABLE_NAME);
  
  try {
    await createFtsIndex(table);
    
    let query = table
      .query()
      .nearestToText(queryText)
      .nearestTo(queryVector)
      .limit(limit);
    
    if (fileFilter === "code") {
      query = query.where("file_path LIKE '%.ts' OR file_path LIKE '%.tsx' OR file_path LIKE '%.js' OR file_path LIKE '%.jsx' OR file_path LIKE '%.py' OR file_path LIKE '%.go' OR file_path LIKE '%.rs'");
    } else if (fileFilter === "docs") {
      query = query.where("file_path LIKE '%.md' OR file_path LIKE '%.txt' OR file_path LIKE '%.rst'");
    }
    
    const results = await query.toArray();
    return { 
      results: results as HybridSearchResult[], 
      searchType: "hybrid", 
      ftsIndexed: true 
    };
  } catch {
    const results = await searchVectors(projectId, queryVector, limit, fileFilter);
    return { 
      results: results as HybridSearchResult[], 
      searchType: "vector-only", 
      ftsIndexed: false 
    };
  }
}

export async function ensureFtsIndex(projectId: number): Promise<boolean> {
  try {
    const db = await getLanceDb(projectId);
    const tableNames = await db.tableNames();
    
    if (!tableNames.includes(TABLE_NAME)) return false;
    
    const table = await db.openTable(TABLE_NAME);
    await createFtsIndex(table);
    return true;
  } catch {
    return false;
  }
}
