import { GoogleGenAI } from "@google/genai";

export interface GeminiEmbeddingConfig {
  apiKey: string;
  model?: string;
  dimensions?: number;
}

export class GeminiLocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiLocationError";
  }
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

function parseGeminiError(error: unknown): Error {
  if (error instanceof Error) {
    const message = error.message || "";
    
    if (message.includes("FAILED_PRECONDITION") || message.includes("location is not supported")) {
      return new GeminiLocationError(
        "Gemini API is not available in your region. Please use a VPN to connect from a supported location (e.g., US, EU) or switch to local embeddings."
      );
    }
    
    if (message.includes("API key")) {
      return new Error("Invalid Gemini API key. Please check your API key in settings.");
    }
    
    try {
      const parsed = JSON.parse(message);
      if (parsed?.error?.message) {
        return new Error(`Gemini API error: ${parsed.error.message}`);
      }
    } catch {
      // Not JSON, use original message
    }
    
    return error;
  }
  
  return new Error(`Unknown Gemini error: ${String(error)}`);
}

export async function embedWithGemini(
  text: string,
  config: GeminiEmbeddingConfig
): Promise<Float32Array> {
  const ai = initClient(config);
  const model = config.model ?? "text-embedding-004";
  
  try {
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
  } catch (error) {
    throw parseGeminiError(error);
  }
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
