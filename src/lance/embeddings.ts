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
    await db.createTable(TABLE_NAME, records as unknown as Record<string, unknown>[]);
    return;
  }
  
  const table = await db.openTable(TABLE_NAME);
  
  const files = [...new Set(records.map(r => r.file_path))];
  
  // Assuming file_path is a simple string, need to quote for SQL filter
  const filter = files.map(f => `file_path = '${f.replace(/'/g, "''")}'`).join(" OR ");
  
  if (filter) {
    await table.delete(filter);
  }
  
  await table.add(records as unknown as Record<string, unknown>[]);
}

export async function deleteFileEmbeddings(projectId: number, filePath: string): Promise<void> {
  const db = await getLanceDb(projectId);
  const tableNames = await db.tableNames();
  
  if (!tableNames.includes(TABLE_NAME)) return;
  
  const table = await db.openTable(TABLE_NAME);
  await table.delete(`file_path = '${filePath.replace(/'/g, "''")}'`);
}

export async function searchVectors(projectId: number, queryVector: number[], limit: number = 5): Promise<EmbeddingRecord[]> {
  const db = await getLanceDb(projectId);
  const tableNames = await db.tableNames();
  
  if (!tableNames.includes(TABLE_NAME)) return [];
  
  const table = await db.openTable(TABLE_NAME);
  
  const results = await table
    .vectorSearch(queryVector)
    .limit(limit)
    .toArray();
    
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
