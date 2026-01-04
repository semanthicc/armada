import { getDb } from "../db";
import type { SemanthiccContext } from "../context";
import { embedText } from "../embeddings";
import { searchVectors } from "../lance/embeddings";

function getLegacyContext(): SemanthiccContext {
  return { db: getDb() };
}

export interface SearchResult {
  id: number;
  filePath: string;
  chunkStart: number;
  chunkEnd: number;
  content: string;
  similarity: number;
}

export async function searchCode(
  ctxOrQuery: SemanthiccContext | string,
  queryOrProjectId: string | number,
  projectIdOrLimit?: number,
  limit?: number
): Promise<SearchResult[]> {
  let ctx: SemanthiccContext;
  let query: string;
  let projectId: number;
  let resultLimit: number;

  if (typeof ctxOrQuery === "string") {
    ctx = getLegacyContext();
    query = ctxOrQuery;
    projectId = queryOrProjectId as number;
    resultLimit = projectIdOrLimit ?? 5;
  } else {
    ctx = ctxOrQuery;
    query = queryOrProjectId as string;
    projectId = projectIdOrLimit!;
    resultLimit = limit ?? 5;
  }

  const queryEmbedding = await embedText(query);
  
  const results = await searchVectors(projectId, Array.from(queryEmbedding), resultLimit);
  
  return results.map((r, index) => ({
    id: index, // LanceDB doesn't expose internal ID easily, using index as placeholder
    filePath: r.file_path,
    chunkStart: r.chunk_start,
    chunkEnd: r.chunk_end,
    content: r.content,
    similarity: 0, // Placeholder, LanceDB returns distance but we need to map it if available
  }));
}

export function searchByFilePattern(
  ctxOrProjectId: SemanthiccContext | number,
  projectIdOrPattern: number | string,
  pattern?: string
): SearchResult[] {
  // File pattern search not supported in LanceDB migration yet
  // Would require SQL-like filter on LanceDB table
  return [];
}
