import { getDb } from "../db";
import type { SemanthiccContext } from "../context";
import { embedText, bufferToEmbedding, cosineSimilarity, findTopK } from "../embeddings";

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
  
  const stmt = ctx.db.prepare(`
    SELECT id, file_path, chunk_start, chunk_end, content, embedding
    FROM embeddings
    WHERE project_id = ? AND is_stale = 0
  `);
  
  const chunks = stmt.all(projectId) as Array<{
    id: number;
    file_path: string;
    chunk_start: number;
    chunk_end: number;
    content: string;
    embedding: Buffer;
  }>;
  
  if (chunks.length === 0) {
    return [];
  }
  
  const withSimilarity = chunks.map(chunk => {
    const chunkEmbedding = bufferToEmbedding(chunk.embedding);
    const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
    
    return {
      id: chunk.id,
      filePath: chunk.file_path,
      chunkStart: chunk.chunk_start,
      chunkEnd: chunk.chunk_end,
      content: chunk.content,
      similarity,
    };
  });
  
  return findTopK(withSimilarity, resultLimit);
}

export function searchByFilePattern(
  ctxOrProjectId: SemanthiccContext | number,
  projectIdOrPattern: number | string,
  pattern?: string
): SearchResult[] {
  let ctx: SemanthiccContext;
  let projectId: number;
  let filePattern: string;

  if (typeof ctxOrProjectId === "number") {
    ctx = getLegacyContext();
    projectId = ctxOrProjectId;
    filePattern = projectIdOrPattern as string;
  } else {
    ctx = ctxOrProjectId;
    projectId = projectIdOrPattern as number;
    filePattern = pattern!;
  }

  const stmt = ctx.db.prepare(`
    SELECT id, file_path, chunk_start, chunk_end, content
    FROM embeddings
    WHERE project_id = ? AND file_path LIKE ? AND is_stale = 0
    ORDER BY file_path, chunk_start
  `);
  
  const likePattern = filePattern.replace(/\*/g, "%");
  
  return stmt.all(projectId, likePattern).map(row => ({
    ...(row as {
      id: number;
      file_path: string;
      chunk_start: number;
      chunk_end: number;
      content: string;
    }),
    filePath: (row as { file_path: string }).file_path,
    chunkStart: (row as { chunk_start: number }).chunk_start,
    chunkEnd: (row as { chunk_end: number }).chunk_end,
    similarity: 1.0,
  }));
}
