export interface Chunk {
  content: string;
  startLine: number;
  endLine: number;
  index: number;
}

const CHUNK_CONFIG = {
  maxTokens: 512,
  overlapLines: 3,
  minChunkLines: 5,
} as const;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function splitIntoChunks(
  content: string,
  maxTokens = CHUNK_CONFIG.maxTokens
): Chunk[] {
  const lines = content.split("\n");
  const chunks: Chunk[] = [];
  
  let currentChunk: string[] = [];
  let chunkStartLine = 0;
  let chunkIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    currentChunk.push(line);
    
    const chunkContent = currentChunk.join("\n");
    const tokens = estimateTokens(chunkContent);
    
    if (tokens >= maxTokens || i === lines.length - 1) {
      if (currentChunk.length >= CHUNK_CONFIG.minChunkLines || i === lines.length - 1) {
        chunks.push({
          content: chunkContent,
          startLine: chunkStartLine + 1,
          endLine: i + 1,
          index: chunkIndex++,
        });
        
        const overlapStart = Math.max(0, currentChunk.length - CHUNK_CONFIG.overlapLines);
        currentChunk = currentChunk.slice(overlapStart);
        chunkStartLine = i - currentChunk.length + 1;
      }
    }
  }
  
  return chunks;
}

export function getChunkConfig() {
  return { ...CHUNK_CONFIG };
}
