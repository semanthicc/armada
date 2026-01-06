import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getDb } from "../db";
import {
  getStoredEmbeddingConfig,
  saveEmbeddingConfig,
  deleteEmbeddingConfig,
  validateEmbeddingConfig,
  EmbeddingConfigMismatchError,
} from "./config-store";

describe("embedding config store", () => {
  const testProjectId = 99999;

  beforeEach(() => {
    const db = getDb();
    db.exec(`DELETE FROM embedding_config WHERE project_id = ${testProjectId}`);
    db.exec(`DELETE FROM projects WHERE id = ${testProjectId}`);
    db.exec(`INSERT INTO projects (id, path, name) VALUES (${testProjectId}, '/test/config-store-path', 'test-config-project')`);
  });

  afterEach(() => {
    const db = getDb();
    db.exec(`DELETE FROM embedding_config WHERE project_id = ${testProjectId}`);
    db.exec(`DELETE FROM projects WHERE id = ${testProjectId}`);
  });

  describe("saveEmbeddingConfig", () => {
    it("should save embedding config with local provider", () => {
      saveEmbeddingConfig(testProjectId, { provider: "local" });

      const stored = getStoredEmbeddingConfig(testProjectId);
      expect(stored).not.toBeNull();
      expect(stored!.provider).toBe("local");
      expect(stored!.model).toBe("Xenova/all-MiniLM-L6-v2");
      expect([384, 768]).toContain(stored!.dimensions);
    });

    it("should save embedding config with gemini provider", () => {
      saveEmbeddingConfig(testProjectId, {
        provider: "gemini",
        geminiModel: "text-embedding-004",
      });

      const stored = getStoredEmbeddingConfig(testProjectId);
      expect(stored).not.toBeNull();
      expect(stored!.provider).toBe("gemini");
      expect(stored!.model).toBe("text-embedding-004");
    });

    it("should update existing config on re-save", () => {
      saveEmbeddingConfig(testProjectId, { provider: "local" });
      saveEmbeddingConfig(testProjectId, {
        provider: "gemini",
        geminiModel: "text-embedding-004",
      });

      const stored = getStoredEmbeddingConfig(testProjectId);
      expect(stored!.provider).toBe("gemini");
    });
  });

  describe("getStoredEmbeddingConfig", () => {
    it("should return null for non-existent project", () => {
      const stored = getStoredEmbeddingConfig(88888);
      expect(stored).toBeNull();
    });
  });

  describe("validateEmbeddingConfig", () => {
    it("should return null when no stored config exists", () => {
      const mismatch = validateEmbeddingConfig(testProjectId, { provider: "local" });
      expect(mismatch).toBeNull();
    });

    it("should return null when config matches", () => {
      saveEmbeddingConfig(testProjectId, { provider: "local" });

      const mismatch = validateEmbeddingConfig(testProjectId, { provider: "local" });
      expect(mismatch).toBeNull();
    });

    it("should detect provider mismatch", () => {
      saveEmbeddingConfig(testProjectId, { provider: "local" });

      const mismatch = validateEmbeddingConfig(testProjectId, { provider: "gemini" });
      expect(mismatch).not.toBeNull();
      expect(["dimensions", "provider"]).toContain(mismatch!.mismatchType);
    });

    it("should detect model mismatch within same provider", () => {
      saveEmbeddingConfig(testProjectId, {
        provider: "gemini",
        geminiModel: "text-embedding-004",
      });

      const mismatch = validateEmbeddingConfig(testProjectId, {
        provider: "gemini",
        geminiModel: "embedding-001",
      });
      expect(mismatch).not.toBeNull();
      expect(mismatch!.mismatchType).toBe("model");
    });
  });

  describe("EmbeddingConfigMismatchError", () => {
    it("should create helpful error message for dimension mismatch", () => {
      const error = new EmbeddingConfigMismatchError({
        stored: {
          projectId: 1,
          provider: "local",
          model: "Xenova/all-MiniLM-L6-v2",
          dimensions: 384,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        current: {
          provider: "gemini",
          model: "text-embedding-004",
          dimensions: 768,
        },
        mismatchType: "dimensions",
      });

      expect(error.message).toContain("384");
      expect(error.message).toContain("768");
      expect(error.message).toContain("--force");
      expect(error.name).toBe("EmbeddingConfigMismatchError");
    });

    it("should create helpful error message for provider mismatch", () => {
      const error = new EmbeddingConfigMismatchError({
        stored: {
          projectId: 1,
          provider: "local",
          model: "test",
          dimensions: 384,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        current: {
          provider: "gemini",
          model: "test",
          dimensions: 384,
        },
        mismatchType: "provider",
      });

      expect(error.message).toContain("local");
      expect(error.message).toContain("gemini");
      expect(error.message).toContain("--force");
    });
  });

  describe("deleteEmbeddingConfig", () => {
    it("should delete config and allow fresh reindex", () => {
      saveEmbeddingConfig(testProjectId, { provider: "local" });
      expect(getStoredEmbeddingConfig(testProjectId)).not.toBeNull();

      deleteEmbeddingConfig(testProjectId);
      expect(getStoredEmbeddingConfig(testProjectId)).toBeNull();

      // After delete, validation should pass (no stored config to mismatch)
      const mismatch = validateEmbeddingConfig(testProjectId, { provider: "gemini" });
      expect(mismatch).toBeNull();
    });

    it("should allow force reindex workflow: delete then save new config", () => {
      // Initial index with local
      saveEmbeddingConfig(testProjectId, { provider: "local" });
      const initial = getStoredEmbeddingConfig(testProjectId);
      expect(initial!.provider).toBe("local");

      // Force reindex: delete old config
      deleteEmbeddingConfig(testProjectId);

      // Save new config with different provider
      saveEmbeddingConfig(testProjectId, {
        provider: "gemini",
        geminiModel: "text-embedding-004",
      });

      const updated = getStoredEmbeddingConfig(testProjectId);
      expect(updated!.provider).toBe("gemini");
      expect(updated!.model).toBe("text-embedding-004");
    });
  });
});
