import { getEmbeddingModel, getEmbeddingDimensions } from "./model";
import { embedWithGemini, getGeminiEmbeddingDimensions, type GeminiEmbeddingConfig } from "./gemini";
import type { EmbeddingConfig } from "../config";

let activeConfig: EmbeddingConfig = { provider: "local" };

type EmbedFunction = (text: string) => Promise<Float32Array>;
let testEmbedder: EmbedFunction | null = null;

export function setTestEmbedder(embedder: EmbedFunction | null): void {
  testEmbedder = embedder;
}

export function setEmbeddingConfig(config: EmbeddingConfig): void {
  activeConfig = config;
}

export function getActiveEmbeddingDimensions(): number {
  if (activeConfig.provider === "gemini") {
    return getGeminiEmbeddingDimensions(activeConfig.dimensions);
  }
  return getEmbeddingDimensions();
}

export async function embedText(text: string): Promise<Float32Array> {
  if (testEmbedder) {
    return testEmbedder(text);
  }
  
  if (activeConfig.provider === "gemini" && activeConfig.geminiApiKey) {
    const geminiConfig: GeminiEmbeddingConfig = {
      apiKey: activeConfig.geminiApiKey,
      model: activeConfig.geminiModel,
      dimensions: activeConfig.dimensions,
    };
    return embedWithGemini(text, geminiConfig);
  }
  
  const model = await getEmbeddingModel();
  
  const output = await model(text, {
    pooling: "mean",
    normalize: true,
  });
  
  const embeddings = output.data as Float32Array;
  
  if (embeddings.length !== getEmbeddingDimensions()) {
    throw new Error(
      `Expected ${getEmbeddingDimensions()} dimensions, got ${embeddings.length}`
    );
  }
  
  return embeddings;
}

export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const results: Float32Array[] = [];
  
  for (const text of texts) {
    results.push(await embedText(text));
  }
  
  return results;
}

export function embeddingToBuffer(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer);
}

export function bufferToEmbedding(buffer: Buffer): Float32Array {
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}
