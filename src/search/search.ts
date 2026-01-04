import { getDb } from "../db";
import type { SemanthiccContext } from "../context";
import { embedText } from "../embeddings";
import { searchVectors, hybridSearch } from "../lance/embeddings";

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

export interface SearchResponse {
  results: SearchResult[];
  searchType: "hybrid" | "vector-only";
  ftsIndexed: boolean;
}

export interface SearchOptions {
  limit?: number;
  fileFilter?: "code" | "docs" | "all";
  useHybrid?: boolean;
}

export async function searchCode(
  ctxOrQuery: SemanthiccContext | string,
  queryOrProjectId: string | number,
  projectIdOrOptions?: number | SearchOptions,
  limitOrOptions?: number | SearchOptions
): Promise<SearchResponse> {
  let ctx: SemanthiccContext;
  let query: string;
  let projectId: number;
  let opts: SearchOptions;

  if (typeof ctxOrQuery === "string") {
    ctx = getLegacyContext();
    query = ctxOrQuery;
    projectId = queryOrProjectId as number;
    opts = typeof projectIdOrOptions === "object" ? projectIdOrOptions : { limit: projectIdOrOptions };
  } else {
    ctx = ctxOrQuery;
    query = queryOrProjectId as string;
    projectId = projectIdOrOptions as number;
    if (typeof limitOrOptions === "number") {
      opts = { limit: limitOrOptions };
    } else {
      opts = limitOrOptions ?? {};
    }
  }

  const resultLimit = opts.limit ?? 5;
  const fileFilter = opts.fileFilter ?? "all";
  const useHybrid = opts.useHybrid ?? true;

  const queryEmbedding = await embedText(query);
  
  if (useHybrid) {
    const response = await hybridSearch(projectId, query, Array.from(queryEmbedding), resultLimit, fileFilter);
    
    return {
      results: response.results.map((r, index) => ({
        id: index,
        filePath: r.file_path,
        chunkStart: r.chunk_start,
        chunkEnd: r.chunk_end,
        content: r.content,
        similarity: r._relevanceScore ?? r._score ?? 0,
      })),
      searchType: response.searchType,
      ftsIndexed: response.ftsIndexed,
    };
  }
  
  const results = await searchVectors(projectId, Array.from(queryEmbedding), resultLimit, fileFilter);
  
  return {
    results: results.map((r, index) => ({
      id: index,
      filePath: r.file_path,
      chunkStart: r.chunk_start,
      chunkEnd: r.chunk_end,
      content: r.content,
      similarity: 0,
    })),
    searchType: "vector-only",
    ftsIndexed: false,
  };
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
