import { chunk as codeChunk, detectLanguage, type ChunkOptions } from "code-chunk-fork";
import type { Chunk } from "./chunker";

const SUPPORTED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".mts", ".cts",
  ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".pyi",
  ".go",
  ".rs",
  ".java",
  ".svelte",
]);

export interface AstChunk extends Chunk {
  contextualizedText: string;
  scopeChain?: string;
  entities?: string[];
}

export function isAstChunk(chunk: Chunk | AstChunk): chunk is AstChunk {
  return "contextualizedText" in chunk;
}

export function isAstChunkable(filepath: string): boolean {
  const ext = filepath.slice(filepath.lastIndexOf(".")).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

export function getLanguage(filepath: string) {
  return detectLanguage(filepath);
}

export async function splitIntoAstChunks(
  filepath: string,
  content: string,
  options?: Partial<ChunkOptions>
): Promise<AstChunk[] | null> {
  const language = detectLanguage(filepath);
  if (!language) {
    return null;
  }

  try {
    const chunks = await codeChunk(filepath, content, {
      maxChunkSize: options?.maxChunkSize ?? 2048,
      contextMode: options?.contextMode ?? "full",
      siblingDetail: options?.siblingDetail ?? "signatures",
      overlapLines: options?.overlapLines ?? 3,
      ...options,
    });

    return chunks.map((c, idx) => {
      const scopeParts = c.context.scope?.map((s) => s.name) ?? [];
      const scopeChain = scopeParts.length > 0 ? scopeParts.join(" > ") : undefined;
      
      const entities = c.context.entities
        ?.map((e) => e.signature ?? e.name)
        .filter(Boolean);

      const primaryEntity = c.context.entities?.[0];
      const symbol = primaryEntity?.name;

      return {
        content: c.text,
        startLine: c.lineRange.start + 1,
        endLine: c.lineRange.end + 1,
        index: idx,
        symbol,
        contextualizedText: c.contextualizedText,
        scopeChain,
        entities,
      };
    });
  } catch (error) {
    console.warn(`[ast-chunker] Failed to parse ${filepath}:`, error);
    return null;
  }
}
