import { getEmbeddingModel, getEmbeddingDimensions } from "./model";

export async function embedText(text: string): Promise<Float32Array> {
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
