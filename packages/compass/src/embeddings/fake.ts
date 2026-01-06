function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function createFakeEmbedding(text: string, dimensions: number = 384): Float32Array {
  const hash = hashString(text);
  const embedding = new Float32Array(dimensions);
  
  for (let i = 0; i < dimensions; i++) {
    embedding[i] = Math.sin(hash + i) * 0.5 + 0.5;
  }
  
  return embedding;
}

export class FakeEmbedder {
  private dimensions: number;
  
  constructor(dimensions: number = 384) {
    this.dimensions = dimensions;
  }
  
  async embed(text: string): Promise<Float32Array> {
    return createFakeEmbedding(text, this.dimensions);
  }
  
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return texts.map(t => createFakeEmbedding(t, this.dimensions));
  }
  
  getDimensions(): number {
    return this.dimensions;
  }
}
