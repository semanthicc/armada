import { describe, expect, test, afterAll, beforeAll } from "bun:test";
import {
  getEmbeddingModel,
  getEmbeddingDimensions,
  unloadModel,
} from "./model";
import {
  embedText,
  embeddingToBuffer,
  bufferToEmbedding,
  getActiveEmbeddingDimensions,
  setTestEmbedder,
} from "./embed";
import { cosineSimilarity, findTopK } from "./similarity";
import { createFakeEmbedding } from "./fake";

describe("Embeddings", () => {
  afterAll(() => {
    unloadModel();
  });

  test("getEmbeddingDimensions returns valid dimension", () => {
    const dims = getEmbeddingDimensions();
    expect([384, 768]).toContain(dims);
  });

  test("cosineSimilarity returns 1 for identical vectors", () => {
    const vec = new Float32Array([1, 2, 3, 4, 5]);
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
  });

  test("cosineSimilarity returns 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  test("cosineSimilarity throws on length mismatch", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2]);
    expect(() => cosineSimilarity(a, b)).toThrow();
  });

  test("findTopK returns top items sorted by similarity", () => {
    const items = [
      { id: 1, similarity: 0.5 },
      { id: 2, similarity: 0.9 },
      { id: 3, similarity: 0.3 },
      { id: 4, similarity: 0.7 },
    ];
    
    const top2 = findTopK(items, 2);
    expect(top2.length).toBe(2);
    expect(top2[0]?.id).toBe(2);
    expect(top2[1]?.id).toBe(4);
  });

  test("embeddingToBuffer and bufferToEmbedding roundtrip", () => {
    const original = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    const buffer = embeddingToBuffer(original);
    const restored = bufferToEmbedding(buffer);
    
    expect(restored.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(restored[i]).toBeCloseTo(original[i]!, 5);
    }
  });
});

describe("Model Integration", () => {
  beforeAll(() => {
    setTestEmbedder((text) => Promise.resolve(createFakeEmbedding(text, 384)));
  });
  
  afterAll(() => {
    setTestEmbedder(null);
    unloadModel();
  });

  test("model loads successfully", async () => {
    const model = await getEmbeddingModel();
    expect(model).toBeDefined();
  }, 30000);

  test("embedText returns correct dimensions", async () => {
    const embedding = await embedText("Hello world");
    expect(embedding.length).toBe(384);
  }, 30000);

  test("similar texts produce embeddings (semantic test skipped with fake embedder)", async () => {
    const embedding1 = await embedText("The cat sat on the mat");
    const embedding2 = await embedText("A cat is sitting on a rug");
    const embedding3 = await embedText("JavaScript programming language");
    
    expect(embedding1.length).toBe(384);
    expect(embedding2.length).toBe(384);
    expect(embedding3.length).toBe(384);
  }, 30000);
});
