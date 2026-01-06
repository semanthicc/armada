export interface Chunk {
  content: string;
  startLine: number;
  endLine: number;
  index: number;
  symbol?: string;
}

const CHUNK_CONFIG = {
  maxTokens: 512,
  overlapLines: 3,
  minChunkLines: 5,
} as const;

// Simple regex patterns to extract symbol names from chunk content
const SYMBOL_PATTERNS = [
  /class\s+([a-zA-Z0-9_]+)/, // class MyClass
  /function\s+([a-zA-Z0-9_]+)/, // function myFunction
  /(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>/, // const myArrow = () =>
  /interface\s+([a-zA-Z0-9_]+)/, // interface MyInterface
  /type\s+([a-zA-Z0-9_]+)\s*=/, // type MyType =
  /def\s+([a-zA-Z0-9_]+)/, // Python def my_func
  /func\s+([a-zA-Z0-9_]+)/, // Go func myFunc
  /struct\s+([a-zA-Z0-9_]+)/, // Rust/C struct MyStruct
];

function extractSymbol(content: string): string | undefined {
  // Only check the first few lines of the chunk for definition
  const lines = content.split('\n').slice(0, 5).join('\n');
  for (const pattern of SYMBOL_PATTERNS) {
    const match = lines.match(pattern);
    if (match && match[1]) return match[1];
  }
  return undefined;
}

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
          symbol: extractSymbol(chunkContent),
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
