import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIMS = 384;

let extractor: FeatureExtractionPipeline | null = null;
let loadPromise: Promise<FeatureExtractionPipeline> | null = null;

export async function getEmbeddingModel(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  
  if (loadPromise) return loadPromise;
  
  loadPromise = pipeline("feature-extraction", MODEL_NAME, {
    quantized: true,
  });
  
  extractor = await loadPromise;
  loadPromise = null;
  
  return extractor;
}

export function getEmbeddingDimensions(): number {
  return EMBEDDING_DIMS;
}

export function unloadModel(): void {
  extractor = null;
  loadPromise = null;
}
