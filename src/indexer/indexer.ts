import { readFileSync } from "node:fs";
import { getDb } from "../db";
import { registerProject } from "../hooks/project-detect";
import { embedText, embeddingToBuffer } from "../embeddings";
import { walkProject, type WalkedFile } from "./walker";
import { splitIntoChunks, type Chunk } from "./chunker";
import { hashFile } from "./hasher";

export interface IndexProgress {
  totalFiles: number;
  processedFiles: number;
  totalChunks: number;
  currentFile: string;
}

export interface IndexResult {
  projectId: number;
  filesIndexed: number;
  chunksCreated: number;
  durationMs: number;
}

export async function indexProject(
  projectPath: string,
  options: {
    projectName?: string;
    maxFiles?: number;
    onProgress?: (progress: IndexProgress) => void;
  } = {}
): Promise<IndexResult> {
  const startTime = Date.now();
  const { projectName, maxFiles = 500, onProgress } = options;
  
  const project = registerProject(projectPath, projectName);
  const db = getDb();
  
  db.exec(`DELETE FROM embeddings WHERE project_id = ${project.id}`);
  
  const files = walkProject(projectPath, { maxFiles });
  
  const insertStmt = db.prepare(`
    INSERT INTO embeddings (project_id, file_path, file_hash, chunk_index, chunk_start, chunk_end, content, embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  let totalChunks = 0;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    
    onProgress?.({
      totalFiles: files.length,
      processedFiles: i,
      totalChunks,
      currentFile: file.relativePath,
    });
    
    let content: string;
    try {
      content = readFileSync(file.absolutePath, "utf-8");
    } catch {
      continue;
    }
    
    if (content.length > 100000) continue;
    
    const fileHash = hashFile(file.absolutePath);
    const chunks = splitIntoChunks(content);
    
    for (const chunk of chunks) {
      const embedding = await embedText(chunk.content);
      const embeddingBuffer = embeddingToBuffer(embedding);
      
      insertStmt.run(
        project.id,
        file.relativePath,
        fileHash,
        chunk.index,
        chunk.startLine,
        chunk.endLine,
        chunk.content,
        embeddingBuffer
      );
      
      totalChunks++;
    }
  }
  
  db.exec(`
    UPDATE projects 
    SET chunk_count = ${totalChunks}, last_indexed_at = ${Date.now()}, updated_at = ${Date.now()}
    WHERE id = ${project.id}
  `);
  
  return {
    projectId: project.id,
    filesIndexed: files.length,
    chunksCreated: totalChunks,
    durationMs: Date.now() - startTime,
  };
}

export function getIndexStats(projectId: number): {
  chunkCount: number;
  fileCount: number;
  staleCount: number;
  lastIndexedAt: number | null;
} {
  const db = getDb();
  
  const stats = db.query(`
    SELECT 
      COUNT(*) as chunkCount,
      COUNT(DISTINCT file_path) as fileCount,
      SUM(CASE WHEN is_stale = 1 THEN 1 ELSE 0 END) as staleCount
    FROM embeddings 
    WHERE project_id = ?
  `).get(projectId) as { chunkCount: number; fileCount: number; staleCount: number };
  
  const project = db.query("SELECT last_indexed_at FROM projects WHERE id = ?").get(projectId) as { last_indexed_at: number | null } | null;
  
  return {
    ...stats,
    lastIndexedAt: project?.last_indexed_at ?? null,
  };
}
