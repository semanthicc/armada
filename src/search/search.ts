import { getDb } from "../db";
import type { SemanthiccContext } from "../context";
import { embedText, validateEmbeddingConfig, EmbeddingConfigMismatchError, getStoredEmbeddingConfig } from "../embeddings";
import { searchVectors, hybridSearch } from "../lance/embeddings";
import { searchTempIndex, isTempIndexed } from "../lance/temp-index";
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
  projectId?: number;
  projectName?: string;
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
  return [];
}

export async function searchTempPath(
  query: string,
  path: string,
  options: { limit?: number; focus?: string } = {}
): Promise<SearchResponse> {
  if (!isTempIndexed(path)) {
    throw new Error(`Path "${path}" is not indexed. Run: semanthicc index --path="${path}"`);
  }
  
  const queryEmbedding = await embedText(query);
  
  const start = performance.now();
  const response = await searchTempIndex(path, Array.from(queryEmbedding), options);
  const duration = performance.now() - start;
  
  log.api.info(`Temp search path="${path}" query="${query}" took ${duration.toFixed(2)}ms (found ${response.results.length} results)`);
  
  return {
    results: response.results.map((r, index) => ({
      id: index,
      filePath: r.file_path,
      chunkStart: r.chunk_start,
      chunkEnd: r.chunk_end,
      content: r.content,
      similarity: r._score ?? 0,
    })),
    searchType: "vector-only",
    ftsIndexed: false,
  };
}

export async function searchMultipleProjects(
  query: string,
  projectIds: number[],
  projectNames: Map<number, string>,
  options: { limit?: number; focus?: string } = {}
): Promise<SearchResponse> {
  if (projectIds.length === 0) {
    return { results: [], searchType: "vector-only", ftsIndexed: false };
  }
  
  const configs = projectIds.map(id => ({ id, config: getStoredEmbeddingConfig(id) }));
  const firstModel = configs[0]?.config?.model;
  const mismatchedProjects = configs.filter(c => c.config?.model !== firstModel);
  
  if (mismatchedProjects.length > 0 && firstModel) {
    const mismatchInfo = mismatchedProjects.map(p => `Project ${p.id}: ${p.config?.model ?? "not configured"}`).join(", ");
    throw new Error(`Cross-project search requires same embedding model. First project uses "${firstModel}" but: ${mismatchInfo}`);
  }
  
  const queryEmbedding = await embedText(query);
  const expandedQuery = expandQuery(query);
  const resultLimit = options.limit ?? 10;
  
  const start = performance.now();
  const allResults: SearchResult[] = [];
  
  for (const projectId of projectIds) {
    try {
      const response = await hybridSearch(
        projectId,
        expandedQuery,
        Array.from(queryEmbedding),
        resultLimit,
        undefined,
        options.focus as "code" | "docs" | "tests" | "mixed" | undefined
      );
      
      for (const r of response.results) {
        allResults.push({
          id: allResults.length,
          filePath: r.file_path,
          chunkStart: r.chunk_start,
          chunkEnd: r.chunk_end,
          content: r.content,
          similarity: r._relevanceScore ?? r._score ?? 0,
          projectId,
          projectName: projectNames.get(projectId) ?? `Project ${projectId}`,
        });
      }
    } catch (error) {
      log.api.warn(`Cross-project search: Error searching project ${projectId}: ${error}`);
    }
  }
  
  allResults.sort((a, b) => b.similarity - a.similarity);
  const limitedResults = allResults.slice(0, resultLimit);
  
  const duration = performance.now() - start;
  log.api.info(`Cross-project search query="${query}" projects=[${projectIds.join(",")}] took ${duration.toFixed(2)}ms (found ${limitedResults.length} results)`);
  
  return {
    results: limitedResults,
    searchType: "hybrid",
    ftsIndexed: true,
  };
}
