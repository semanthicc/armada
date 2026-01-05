import { GoogleGenAI } from "@google/genai";

export interface GeminiEmbeddingConfig {
  apiKey: string;
  model?: string;
  dimensions?: number;
}

let client: GoogleGenAI | null = null;
let currentConfig: GeminiEmbeddingConfig | null = null;

function initClient(config: GeminiEmbeddingConfig): GoogleGenAI {
  if (client && currentConfig?.apiKey === config.apiKey) {
    return client;
  }
  
  client = new GoogleGenAI({ apiKey: config.apiKey });
  currentConfig = config;
  return client;
}

export async function embedWithGemini(
  text: string,
  config: GeminiEmbeddingConfig
): Promise<Float32Array> {
  const ai = initClient(config);
  const model = config.model ?? "text-embedding-004";
  
  const response = await ai.models.embedContent({
    model,
    contents: text,
    config: config.dimensions ? { outputDimensionality: config.dimensions } : undefined,
  });
  
  const embedding = response.embeddings?.[0]?.values;
  if (!embedding) {
    throw new Error("Gemini returned no embedding");
  }
  
  return new Float32Array(embedding);
}

export async function embedBatchWithGemini(
  texts: string[],
  config: GeminiEmbeddingConfig
): Promise<Float32Array[]> {
  const results: Float32Array[] = [];
  
  for (const text of texts) {
    const embedding = await embedWithGemini(text, config);
    results.push(embedding);
  }
  
  return results;
}

export function getGeminiEmbeddingDimensions(dimensions?: number): number {
  return dimensions ?? 768;
}
