import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createTestContext, type TestContext } from "../db/test-utils";
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
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  test("addMemory creates and returns memory", () => {
    const memory = addMemory(ctx, {
      concept_type: "pattern",
      content: "Always use strict mode",
      domain: "typescript",
    });

    expect(memory.id).toBe(1);
    expect(memory.content).toBe("Always use strict mode");
    expect(memory.confidence).toBe(HEURISTICS.DEFAULT_CONFIDENCE);
  });

  test("getMemory retrieves by id", () => {
    const created = addMemory(ctx, {
      concept_type: "decision",
      content: "Use Redis for caching",
    });

    const retrieved = getMemory(ctx, created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.content).toBe("Use Redis for caching");
  });

  test("deleteMemory removes memory", () => {
    const memory = addMemory(ctx, {
      concept_type: "constraint",
      content: "Max 100 items per page",
    });

    expect(deleteMemory(ctx, memory.id)).toBe(true);
    expect(getMemory(ctx, memory.id)).toBeNull();
  });

  test("listMemories returns sorted by effective confidence", () => {
    addMemory(ctx, { concept_type: "pattern", content: "Low conf", domain: "test" });
    
    const high = addMemory(ctx, { concept_type: "pattern", content: "High conf", domain: "test" });
    ctx.db.exec(`UPDATE memories SET confidence = 0.9 WHERE id = ${high.id}`);

    const results = listMemories(ctx, { domain: "test" });
    expect(results[0]).not.toBeUndefined();
    expect(results[0]!.content).toBe("High conf");
  });

  test("validateMemory increases confidence", () => {
    const memory = addMemory(ctx, {
      concept_type: "pattern",
      content: "Test pattern",
    });

    const validated = validateMemory(ctx, memory.id);
    expect(validated).not.toBeNull();
    expect(validated!.confidence).toBe(0.55);
    expect(validated!.times_validated).toBe(1);
  });

  test("validateMemory promotes to golden when threshold met", () => {
    const memory = addMemory(ctx, {
      concept_type: "rule",
      content: "Never use any",
    });

    ctx.db.exec(`UPDATE memories SET confidence = 0.88, times_validated = 2 WHERE id = ${memory.id}`);

    const validated = validateMemory(ctx, memory.id);
    expect(validated).not.toBeNull();
    expect(validated!.confidence).toBe(0.93);
    expect(Boolean(validated!.is_golden)).toBe(true);
  });

  test("violateMemory decreases confidence", () => {
    const memory = addMemory(ctx, {
      concept_type: "pattern",
      content: "Test pattern",
    });

    const violated = violateMemory(ctx, memory.id);
    expect(violated).not.toBeNull();
    expect(violated!.confidence).toBe(0.4);
    expect(violated!.times_violated).toBe(1);
  });

  test("violateMemory demotes golden", () => {
    const memory = addMemory(ctx, {
      concept_type: "rule",
      content: "Golden rule",
    });

    ctx.db.exec(`UPDATE memories SET is_golden = 1, confidence = 0.95 WHERE id = ${memory.id}`);

    const violated = violateMemory(ctx, memory.id);
    expect(violated).not.toBeNull();
    expect(Boolean(violated!.is_golden)).toBe(false);
  });
});

describe("supersedeMemory", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  test("links old → new and updates status", () => {
    const old = addMemory(ctx, {
      concept_type: "pattern",
      content: "Use var for variables",
      domain: "typescript",
    });

    const result = supersedeMemory(ctx, old.id, "Use const/let instead of var");

    expect(result).not.toBeNull();
    expect(result!.old.status).toBe("superseded");
    expect(result!.old.superseded_by).toBe(result!.new.id);
    expect(result!.new.evolved_from).toBe(old.id);
    expect(result!.new.status).toBe("current");
  });

  test("copies domain and project_id from old memory", () => {
    ctx.db.exec("INSERT INTO projects (path, name) VALUES ('/test/path', 'test-project')");
    const projectRow = ctx.db.query("SELECT id FROM projects WHERE path = '/test/path'").get() as { id: number };

    const old = addMemory(ctx, {
      concept_type: "decision",
      content: "Use REST API",
      domain: "architecture",
      project_id: projectRow.id,
    });

    const result = supersedeMemory(ctx, old.id, "Use GraphQL instead");

    expect(result).not.toBeNull();
    expect(result!.new.domain).toBe("architecture");
    expect(result!.new.project_id).toBe(projectRow.id);
    expect(result!.new.concept_type).toBe("decision");
  });
  
  test("returns null for non-existent memory", () => {
    const result = supersedeMemory(ctx, 99999, "New content");
    expect(result).toBeNull();
  });

  test("returns null for already-superseded memory", () => {
    const old = addMemory(ctx, {
      concept_type: "pattern",
      content: "Original",
    });

    supersedeMemory(ctx, old.id, "First supersede");
    const secondAttempt = supersedeMemory(ctx, old.id, "Second supersede");

    expect(secondAttempt).toBeNull();
  });

  test("new memory starts with default confidence", () => {
    const old = addMemory(ctx, {
      concept_type: "pattern",
      content: "Old pattern",
    });

    ctx.db.exec(`UPDATE memories SET confidence = 0.95 WHERE id = ${old.id}`);

    const result = supersedeMemory(ctx, old.id, "New pattern");

    expect(result).not.toBeNull();
    expect(result!.new.confidence).toBe(HEURISTICS.DEFAULT_CONFIDENCE);
  });
});

describe("getMemoryChain", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  test("returns single-item array for non-evolved memory", () => {
    const memory = addMemory(ctx, {
      concept_type: "pattern",
      content: "Standalone pattern",
    });

    const chain = getMemoryChain(ctx, memory.id);

    expect(chain).toHaveLength(1);
    expect(chain[0]!.id).toBe(memory.id);
  });

  test("returns full chain for superseded memory", () => {
    const v1 = addMemory(ctx, { concept_type: "pattern", content: "Version 1" });
    const r1 = supersedeMemory(ctx, v1.id, "Version 2");
    if (!r1) throw new Error("r1 is null");
    
    supersedeMemory(ctx, r1.new.id, "Version 3");

    const chain = getMemoryChain(ctx, v1.id);

    expect(chain).toHaveLength(3);
    expect(chain[0]!.content).toBe("Version 1");
    expect(chain[1]!.content).toBe("Version 2");
    expect(chain[2]!.content).toBe("Version 3");
  });

  test("returns chain starting from middle element", () => {
    const v1 = addMemory(ctx, { concept_type: "pattern", content: "V1" });
    const r1 = supersedeMemory(ctx, v1.id, "V2");
    if (!r1) throw new Error("r1 is null");
    
    supersedeMemory(ctx, r1.new.id, "V3");

    const chain = getMemoryChain(ctx, r1.new.id);

    expect(chain).toHaveLength(3);
    expect(chain[0]!.content).toBe("V1");
    expect(chain[2]!.content).toBe("V3");
  });

  test("returns empty array for non-existent memory", () => {
    const chain = getMemoryChain(ctx, 99999);
    expect(chain).toHaveLength(0);
  });
});
