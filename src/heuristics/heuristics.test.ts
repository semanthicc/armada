import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { getDb, resetDb } from "../db";
import { join } from "node:path";
import { unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  HEURISTICS,
  getEffectiveConfidence,
  calculateValidatedConfidence,
  calculateViolatedConfidence,
  shouldPromoteToGolden,
} from "./confidence";
import {
  addMemory,
  getMemory,
  deleteMemory,
  listMemories,
  validateMemory,
  violateMemory,
  supersedeMemory,
  getMemoryChain,
} from "./repository";

function getTestDbPath(): string {
  return join(tmpdir(), `semanthicc-heuristics-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

let testDbPath: string;

function cleanupTestDb(): void {
  resetDb();
  if (testDbPath && existsSync(testDbPath)) {
    try {
      unlinkSync(testDbPath);
      const walPath = `${testDbPath}-wal`;
      const shmPath = `${testDbPath}-shm`;
      if (existsSync(walPath)) unlinkSync(walPath);
      if (existsSync(shmPath)) unlinkSync(shmPath);
    } catch {
      // Ignore cleanup errors on Windows
    }
  }
}

describe("Confidence", () => {
  test("getEffectiveConfidence returns full confidence for golden rules", () => {
    const result = getEffectiveConfidence(0.9, true, null, Date.now());
    expect(result).toBe(0.9);
  });

  test("getEffectiveConfidence applies decay for non-golden", () => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const result = getEffectiveConfidence(0.8, false, null, thirtyDaysAgo);
    expect(result).toBeCloseTo(0.4, 1);
  });

  test("calculateValidatedConfidence adds delta", () => {
    expect(calculateValidatedConfidence(0.5)).toBe(0.55);
    expect(calculateValidatedConfidence(0.98)).toBe(1.0);
  });

  test("calculateViolatedConfidence subtracts delta", () => {
    expect(calculateViolatedConfidence(0.5)).toBe(0.4);
    expect(calculateViolatedConfidence(0.05)).toBe(0.0);
  });

  test("shouldPromoteToGolden requires high confidence and validations", () => {
    expect(shouldPromoteToGolden(0.9, 3, 0)).toBe(true);
    expect(shouldPromoteToGolden(0.8, 3, 0)).toBe(false);
    expect(shouldPromoteToGolden(0.9, 2, 0)).toBe(false);
    expect(shouldPromoteToGolden(0.9, 3, 1)).toBe(false);
  });
});

describe("Repository", () => {
  beforeEach(() => {
    testDbPath = getTestDbPath();
    getDb(testDbPath);
  });

  afterEach(() => {
    cleanupTestDb();
  });

  test("addMemory creates and returns memory", () => {
    const memory = addMemory({
      concept_type: "pattern",
      content: "Always use strict mode",
      domain: "typescript",
    });

    expect(memory.id).toBe(1);
    expect(memory.content).toBe("Always use strict mode");
    expect(memory.confidence).toBe(HEURISTICS.DEFAULT_CONFIDENCE);
  });

  test("getMemory retrieves by id", () => {
    const created = addMemory({
      concept_type: "decision",
      content: "Use Redis for caching",
    });

    const retrieved = getMemory(created.id);
    expect(retrieved?.content).toBe("Use Redis for caching");
  });

  test("deleteMemory removes memory", () => {
    const memory = addMemory({
      concept_type: "constraint",
      content: "Max 100 items per page",
    });

    expect(deleteMemory(memory.id)).toBe(true);
    expect(getMemory(memory.id)).toBeNull();
  });

  test("listMemories returns sorted by effective confidence", () => {
    addMemory({ concept_type: "pattern", content: "Low conf", domain: "test" });
    
    const high = addMemory({ concept_type: "pattern", content: "High conf", domain: "test" });
    const db = getDb();
    db.exec(`UPDATE memories SET confidence = 0.9 WHERE id = ${high.id}`);

    const results = listMemories({ domain: "test" });
    expect(results[0]?.content).toBe("High conf");
  });

  test("validateMemory increases confidence", () => {
    const memory = addMemory({
      concept_type: "pattern",
      content: "Test pattern",
    });

    const validated = validateMemory(memory.id);
    expect(validated?.confidence).toBe(0.55);
    expect(validated?.times_validated).toBe(1);
  });

  test("validateMemory promotes to golden when threshold met", () => {
    const memory = addMemory({
      concept_type: "rule",
      content: "Never use any",
    });

    const db = getDb();
    db.exec(`UPDATE memories SET confidence = 0.88, times_validated = 2 WHERE id = ${memory.id}`);

    const validated = validateMemory(memory.id);
    expect(validated?.confidence).toBe(0.93);
    expect(Boolean(validated?.is_golden)).toBe(true);
  });

  test("violateMemory decreases confidence", () => {
    const memory = addMemory({
      concept_type: "pattern",
      content: "Test pattern",
    });

    const violated = violateMemory(memory.id);
    expect(violated?.confidence).toBe(0.4);
    expect(violated?.times_violated).toBe(1);
  });

  test("violateMemory demotes golden", () => {
    const memory = addMemory({
      concept_type: "rule",
      content: "Golden rule",
    });

    const db = getDb();
    db.exec(`UPDATE memories SET is_golden = 1, confidence = 0.95 WHERE id = ${memory.id}`);

    const violated = violateMemory(memory.id);
    expect(Boolean(violated?.is_golden)).toBe(false);
  });
});

describe("supersedeMemory", () => {
  beforeEach(() => {
    testDbPath = getTestDbPath();
    getDb(testDbPath);
  });

  afterEach(() => {
    cleanupTestDb();
  });

  test("links old → new and updates status", () => {
    const old = addMemory({
      concept_type: "pattern",
      content: "Use var for variables",
      domain: "typescript",
    });

    const result = supersedeMemory(old.id, "Use const/let instead of var");

    expect(result).not.toBeNull();
    expect(result!.old.status).toBe("superseded");
    expect(result!.old.superseded_by).toBe(result!.new.id);
    expect(result!.new.evolved_from).toBe(old.id);
    expect(result!.new.status).toBe("current");
  });

  test("copies domain and project_id from old memory", () => {
    const db = getDb();
    db.exec("INSERT INTO projects (path, name) VALUES ('/test/path', 'test-project')");
    const projectRow = db.query("SELECT id FROM projects WHERE path = '/test/path'").get() as { id: number };

    const old = addMemory({
      concept_type: "decision",
      content: "Use REST API",
      domain: "architecture",
      project_id: projectRow.id,
    });

    const result = supersedeMemory(old.id, "Use GraphQL instead");

    expect(result!.new.domain).toBe("architecture");
    expect(result!.new.project_id).toBe(projectRow.id);
    expect(result!.new.concept_type).toBe("decision");
  });

  test("returns null for non-existent memory", () => {
    const result = supersedeMemory(99999, "New content");
    expect(result).toBeNull();
  });

  test("returns null for already-superseded memory", () => {
    const old = addMemory({
      concept_type: "pattern",
      content: "Original",
    });

    supersedeMemory(old.id, "First supersede");
    const secondAttempt = supersedeMemory(old.id, "Second supersede");

    expect(secondAttempt).toBeNull();
  });

  test("new memory starts with default confidence", () => {
    const old = addMemory({
      concept_type: "pattern",
      content: "Old pattern",
    });

    const db = getDb();
    db.exec(`UPDATE memories SET confidence = 0.95 WHERE id = ${old.id}`);

    const result = supersedeMemory(old.id, "New pattern");

    expect(result!.new.confidence).toBe(HEURISTICS.DEFAULT_CONFIDENCE);
  });
});

describe("getMemoryChain", () => {
  beforeEach(() => {
    testDbPath = getTestDbPath();
    getDb(testDbPath);
  });

  afterEach(() => {
    cleanupTestDb();
  });

  test("returns single-item array for non-evolved memory", () => {
    const memory = addMemory({
      concept_type: "pattern",
      content: "Standalone pattern",
    });

    const chain = getMemoryChain(memory.id);

    expect(chain).toHaveLength(1);
    expect(chain[0].id).toBe(memory.id);
  });

  test("returns full chain for superseded memory", () => {
    const v1 = addMemory({ concept_type: "pattern", content: "Version 1" });
    const r1 = supersedeMemory(v1.id, "Version 2");
    const r2 = supersedeMemory(r1!.new.id, "Version 3");

    const chain = getMemoryChain(v1.id);

    expect(chain).toHaveLength(3);
    expect(chain[0].content).toBe("Version 1");
    expect(chain[1].content).toBe("Version 2");
    expect(chain[2].content).toBe("Version 3");
  });

  test("returns chain starting from middle element", () => {
    const v1 = addMemory({ concept_type: "pattern", content: "V1" });
    const r1 = supersedeMemory(v1.id, "V2");
    supersedeMemory(r1!.new.id, "V3");

    const chain = getMemoryChain(r1!.new.id);

    expect(chain).toHaveLength(3);
    expect(chain[0].content).toBe("V1");
    expect(chain[2].content).toBe("V3");
  });

  test("returns empty array for non-existent memory", () => {
    const chain = getMemoryChain(99999);
    expect(chain).toHaveLength(0);
  });
});
