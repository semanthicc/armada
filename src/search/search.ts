import { getDb } from "../db";
import type { SemanthiccContext } from "../context";
import { embedText, validateEmbeddingConfig, EmbeddingConfigMismatchError } from "../embeddings";
import { searchVectors, hybridSearch } from "../lance/embeddings";
import { loadGlobalConfig } from "../config";
import { expandQuery } from "./synonyms";
import { log } from "../logger";

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
  query: string, 
  projectId: number, 
  limit: number | { limit?: number; fileFilter?: "code" | "docs" | "all"; focus?: "code" | "docs" | "tests" | "mixed"; useHybrid?: boolean } = 5, 
  fileFilter?: "code" | "docs" | "all",
  focus?: "code" | "docs" | "tests" | "mixed"
): Promise<SearchResponse> {
  const opts = typeof limit === "object" ? limit : { limit, fileFilter, focus };
  const resultLimit = opts.limit ?? 5;
  const useHybrid = opts.useHybrid ?? true;
  const searchFocus = opts.focus ?? focus;

  const currentConfig = loadGlobalConfig().embedding ?? { provider: "local" };
  const mismatch = validateEmbeddingConfig(projectId, currentConfig);
  if (mismatch) {
    throw new EmbeddingConfigMismatchError(mismatch);
  }

  const queryEmbedding = await embedText(query);
  const expandedQuery = expandQuery(query);
  
  const start = performance.now();
  let resultCount = 0;
  
  try {
    if (useHybrid) {
      const response = await hybridSearch(
        projectId, 
        expandedQuery, 
        Array.from(queryEmbedding), 
        resultLimit, 
        opts.fileFilter,
        searchFocus
      );
      resultCount = response.results.length;
      
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
    
    const results = await searchVectors(
      projectId, 
      Array.from(queryEmbedding), 
      resultLimit, 
      opts.fileFilter,
      searchFocus
    );
    resultCount = results.length;
    
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
  } finally {
    const duration = performance.now() - start;
    log.api.info(`Search query="${query}" took ${duration.toFixed(2)}ms (found ${resultCount} results)`);
  }
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
