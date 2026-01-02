import { getDb } from "../db";
import { embedText, bufferToEmbedding, cosineSimilarity, findTopK } from "../embeddings";

export interface SearchResult {
  id: number;
  filePath: string;
  chunkStart: number;
  chunkEnd: number;
  content: string;
  similarity: number;
}

export async function searchCode(
  query: string,
  projectId: number,
  limit = 5
): Promise<SearchResult[]> {
  const db = getDb();
  const queryEmbedding = await embedText(query);
  
  const stmt = db.prepare(`
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
  
  return findTopK(withSimilarity, limit);
}

export function searchByFilePattern(
  projectId: number,
  pattern: string
): SearchResult[] {
  const db = getDb();
  
  const stmt = db.prepare(`
    SELECT id, file_path, chunk_start, chunk_end, content
    FROM embeddings
    WHERE project_id = ? AND file_path LIKE ? AND is_stale = 0
    ORDER BY file_path, chunk_start
  `);
  
  const likePattern = pattern.replace(/\*/g, "%");
  
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
