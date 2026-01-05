import { getDb } from "../db";
import { getActiveEmbeddingDimensions } from "./embed";
import type { EmbeddingConfig } from "../config";

export interface StoredEmbeddingConfig {
  projectId: number;
  provider: "local" | "gemini";
  model: string;
  dimensions: number;
  createdAt: number;
  updatedAt: number;
}

export interface EmbeddingConfigMismatch {
  stored: StoredEmbeddingConfig;
  current: {
    provider: string;
    model: string;
    dimensions: number;
  };
  mismatchType: "provider" | "model" | "dimensions";
}

interface DbEmbeddingConfig {
  id: number;
  project_id: number;
  provider: string;
  model: string;
  dimensions: number;
  created_at: number;
  updated_at: number;
}

const LOCAL_MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

export function getStoredEmbeddingConfig(projectId: number): StoredEmbeddingConfig | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM embedding_config WHERE project_id = ?"
  ).get(projectId) as DbEmbeddingConfig | undefined;
  
  if (!row) return null;
  
  return {
    projectId: row.project_id,
    provider: row.provider as "local" | "gemini",
    model: row.model,
    dimensions: row.dimensions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function saveEmbeddingConfig(
  projectId: number, 
  config: EmbeddingConfig
): void {
  const db = getDb();
  const dimensions = getActiveEmbeddingDimensions();
  const provider = config.provider || "local";
  const model = provider === "gemini" 
    ? (config.geminiModel || "text-embedding-004")
    : LOCAL_MODEL_NAME;
  
  db.prepare(`
    INSERT INTO embedding_config (project_id, provider, model, dimensions)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      provider = excluded.provider,
      model = excluded.model,
      dimensions = excluded.dimensions,
      updated_at = unixepoch('now') * 1000
  `).run(projectId, provider, model, dimensions);
}

export function deleteEmbeddingConfig(projectId: number): void {
  const db = getDb();
  db.prepare("DELETE FROM embedding_config WHERE project_id = ?").run(projectId);
}

export function validateEmbeddingConfig(
  projectId: number,
  currentConfig: EmbeddingConfig
): EmbeddingConfigMismatch | null {
  const stored = getStoredEmbeddingConfig(projectId);
  if (!stored) return null;
  
  const currentDimensions = getActiveEmbeddingDimensions();
  const currentProvider = currentConfig.provider || "local";
  const currentModel = currentProvider === "gemini"
    ? (currentConfig.geminiModel || "text-embedding-004")
    : LOCAL_MODEL_NAME;
  
  if (stored.dimensions !== currentDimensions) {
    return {
      stored,
      current: {
        provider: currentProvider,
        model: currentModel,
        dimensions: currentDimensions,
      },
      mismatchType: "dimensions",
    };
  }
  
  if (stored.provider !== currentProvider) {
    return {
      stored,
      current: {
        provider: currentProvider,
        model: currentModel,
        dimensions: currentDimensions,
      },
      mismatchType: "provider",
    };
  }
  
  if (stored.model !== currentModel) {
    return {
      stored,
      current: {
        provider: currentProvider,
        model: currentModel,
        dimensions: currentDimensions,
      },
      mismatchType: "model",
    };
  }
  
  return null;
}

export class EmbeddingConfigMismatchError extends Error {
  constructor(public mismatch: EmbeddingConfigMismatch) {
    const { stored, current, mismatchType } = mismatch;
    let message: string;
    
    if (mismatchType === "dimensions") {
      message = `Embedding dimension mismatch: Index was created with ${stored.provider} (${stored.dimensions} dims), ` +
        `but current config uses ${current.provider} (${current.dimensions} dims). ` +
        `Run 'semanthicc index --force' to reindex with the new provider.`;
    } else if (mismatchType === "provider") {
      message = `Embedding provider mismatch: Index uses ${stored.provider}, but current config uses ${current.provider}. ` +
        `Run 'semanthicc index --force' to reindex.`;
    } else {
      message = `Embedding model mismatch: Index uses ${stored.model}, but current config uses ${current.model}. ` +
        `Run 'semanthicc index --force' to reindex.`;
    }
    
    super(message);
    this.name = "EmbeddingConfigMismatchError";
  }
}
