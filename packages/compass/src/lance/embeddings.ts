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
  symbol?: string;
  scope_chain?: string;
  contextualized_content?: string;
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
  
  // Clean records - remove undefined fields to avoid schema mismatch
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
  
  if (!tableNames.includes(TABLE_NAME)) {
    const table = await db.createTable(TABLE_NAME, cleanRecords);
    await createFtsIndex(table);
    return;
  }
  
  const table = await db.openTable(TABLE_NAME);
  
  // Check if we need to migrate schema (add new columns)
  const schema = await table.schema();
  const existingColumns = schema.fields.map((f: { name: string }) => f.name);
  const neededColumns = ['scope_chain', 'contextualized_content', 'symbol'];
  
  for (const col of neededColumns) {
    if (!existingColumns.includes(col) && cleanRecords.some(r => r[col] !== undefined)) {
      try {
        await table.addColumns([{ name: col, valueSql: "NULL" }]);
      } catch {
        // Column might already exist or migration failed - continue anyway
      }
    }
  }
  
  const files = [...new Set(records.map(r => r.file_path))];
  
  const filter = files.map(f => `file_path = '${f.replace(/'/g, "''")}'`).join(" OR ");
  
  if (filter) {
    await table.delete(filter);
  }
  
  await table.add(cleanRecords);
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

const CODE_EXTENSIONS = "file_path LIKE '%.ts' OR file_path LIKE '%.tsx' OR file_path LIKE '%.js' OR file_path LIKE '%.jsx' OR file_path LIKE '%.py' OR file_path LIKE '%.go' OR file_path LIKE '%.rs' OR file_path LIKE '%.java' OR file_path LIKE '%.c' OR file_path LIKE '%.cpp'";
const DOC_EXTENSIONS = "file_path LIKE '%.md' OR file_path LIKE '%.txt' OR file_path LIKE '%.rst'";
const TEST_PATTERNS = "file_path LIKE '%.test.%' OR file_path LIKE '%.spec.%' OR file_path LIKE '%/tests/%' OR file_path LIKE '%/__tests__/%'";

function buildFocusWhereClause(
  fileFilter?: "code" | "docs" | "all",
  focus?: "code" | "docs" | "tests" | "mixed"
): string | null {
  const conditions: string[] = [];
  
  if (fileFilter === "code") {
    conditions.push(`(${CODE_EXTENSIONS})`);
  } else if (fileFilter === "docs") {
    conditions.push(`(${DOC_EXTENSIONS})`);
  }
  
  if (focus === "code") {
    conditions.push(`(${CODE_EXTENSIONS})`);
    conditions.push(`NOT (${TEST_PATTERNS})`);
  } else if (focus === "docs") {
    conditions.push(`(${DOC_EXTENSIONS})`);
  } else if (focus === "tests") {
    conditions.push(`(${TEST_PATTERNS})`);
  }
  
  if (conditions.length === 0) return null;
  return conditions.join(" AND ");
}

export async function searchVectors(
  projectId: number, 
  queryVector: number[], 
  limit: number = 5,
  fileFilter?: "code" | "docs" | "all",
  focus?: "code" | "docs" | "tests" | "mixed"
): Promise<EmbeddingRecord[]> {
  const db = await getLanceDb(projectId);
  const tableNames = await db.tableNames();
  
  if (!tableNames.includes(TABLE_NAME)) return [];
  
  const table = await db.openTable(TABLE_NAME);
  
  let query = table.vectorSearch(queryVector);
  
  const whereClause = buildFocusWhereClause(fileFilter, focus);
  if (whereClause) {
    query = query.where(whereClause);
  }
  
  const results = await query.limit(limit).toArray();
  return results as EmbeddingRecord[];
}

export async function hybridSearch(
  projectId: number,
  queryText: string,
  queryVector: number[],
  limit: number = 5,
  fileFilter?: "code" | "docs" | "all",
  focus?: "code" | "docs" | "tests" | "mixed"
): Promise<HybridSearchResponse> {
  const db = await getLanceDb(projectId);
  const tableNames = await db.tableNames();
  
  if (!tableNames.includes(TABLE_NAME)) {
    return { results: [], searchType: "vector-only", ftsIndexed: false };
  }
  
  const table = await db.openTable(TABLE_NAME);
  
  try {
    let query = (table as any).search(queryText, "hybrid");
    
    if (query.vector) {
      query = query.vector(queryVector);
    } else if (query.nearestTo) {
      query = query.nearestTo(queryVector);
    }
    
    const whereClause = buildFocusWhereClause(fileFilter, focus);
    if (whereClause) {
      query = query.where(whereClause);
    }
    
    // Fetch more results to allow for re-ranking
    const candidates = await query.limit(limit * 3).toArray() as HybridSearchResult[];
    
    // Re-rank based on focus (secondary ranking after WHERE clause filtering)
    const ranked = candidates.map(r => {
      let boost = 1.0;
      const lowerPath = r.file_path.toLowerCase();
      
      const isTest = lowerPath.includes('.test.') || lowerPath.includes('.spec.') || lowerPath.includes('/tests/') || lowerPath.includes('/__tests__/');
      const isCode = /\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|hpp)$/.test(lowerPath);
      const isDoc = /\.(md|txt|rst)$/.test(lowerPath);
      
      if (focus === "code") {
        if (isCode && !isTest) boost = 3.0;
        if (isTest) boost = 0.3;
        if (isDoc) boost = 0.2;
      } else if (focus === "docs") {
        if (isDoc) boost = 3.0;
        if (isCode) boost = 0.5;
      } else if (focus === "tests") {
        if (isTest) boost = 3.0;
        if (isCode && !isTest) boost = 0.5;
      } else {
        // Default (Mixed) - slight preference for production code
        if (isCode && !isTest) boost = 1.5;
        if (isTest) boost = 0.7;
      }
      
      return { ...r, _boost: boost, _originalIndex: candidates.indexOf(r) };
    });
    
    // Sort by boosted rank (higher is better)
    ranked.sort((a, b) => {
      const scoreA = (candidates.length - a._originalIndex) * a._boost;
      const scoreB = (candidates.length - b._originalIndex) * b._boost;
      return scoreB - scoreA;
    });
    
    const results = ranked.slice(0, limit);

    return { 
      results, 
      searchType: "hybrid", 
      ftsIndexed: true 
    };
  } catch (e) {
    // Fallback to vector search if FTS fails
    const results = await searchVectors(projectId, queryVector, limit, fileFilter, focus);
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