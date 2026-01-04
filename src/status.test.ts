import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestContext, type TestContext } from "./db/test-utils";
import { addMemory } from "./heuristics/repository";
import { getStatus, formatStatus } from "./status";

describe("Status", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
    ctx.db.exec("INSERT INTO projects (id, path, name, chunk_count, last_indexed_at) VALUES (1, '/test/project', 'Test Project', 100, ?)");
    ctx.db.run("UPDATE projects SET last_indexed_at = ? WHERE id = 1", [Date.now() - 3600000]);
  });

  afterEach(() => {
    ctx.cleanup();
  });

  describe("getStatus", () => {
    test("returns empty stats for empty project", () => {
      const status = getStatus(ctx, 1);
      
      expect(status.projectId).toBe(1);
      expect(status.projectName).toBe("Test Project");
      expect(status.projectPath).toBe("/test/project");
      expect(status.memories.total).toBe(0);
      expect(status.memories.golden).toBe(0);
      expect(status.memories.passive).toBe(0);
    });

    test("counts memories correctly", () => {
      addMemory(ctx, { concept_type: "pattern", content: "Pattern 1", project_id: 1 });
      addMemory(ctx, { concept_type: "rule", content: "Rule 1", project_id: 1 });
      addMemory(ctx, { concept_type: "decision", content: "Decision 1", project_id: 1 });
      
      const status = getStatus(ctx, 1);
      
      expect(status.memories.total).toBe(3);
    });

    test("counts golden memories", () => {
      const m = addMemory(ctx, { concept_type: "rule", content: "Golden rule", project_id: 1 });
      ctx.db.exec(`UPDATE memories SET is_golden = 1 WHERE id = ${m.id}`);
      addMemory(ctx, { concept_type: "pattern", content: "Regular pattern", project_id: 1 });
      
      const status = getStatus(ctx, 1);
      
      expect(status.memories.golden).toBe(1);
    });

    test("counts passive memories", () => {
      addMemory(ctx, { concept_type: "learning", content: "Passive learning", project_id: 1, source: "passive" });
      addMemory(ctx, { concept_type: "pattern", content: "Explicit pattern", project_id: 1 });
      
      const status = getStatus(ctx, 1);
      
      expect(status.memories.passive).toBe(1);
    });

    test("calculates confidence stats", () => {
      const m1 = addMemory(ctx, { concept_type: "pattern", content: "Low conf", project_id: 1 });
      const m2 = addMemory(ctx, { concept_type: "pattern", content: "High conf", project_id: 1 });
      ctx.db.exec(`UPDATE memories SET confidence = 0.3 WHERE id = ${m1.id}`);
      ctx.db.exec(`UPDATE memories SET confidence = 0.9 WHERE id = ${m2.id}`);
      
      const status = getStatus(ctx, 1);
      
      expect(status.memories.minConfidence).toBe(0.3);
      expect(status.memories.maxConfidence).toBe(0.9);
      expect(status.memories.avgConfidence).toBeCloseTo(0.6, 1);
    });

    test("returns type breakdown", () => {
      addMemory(ctx, { concept_type: "pattern", content: "Pattern 1", project_id: 1 });
      addMemory(ctx, { concept_type: "pattern", content: "Pattern 2", project_id: 1 });
      addMemory(ctx, { concept_type: "rule", content: "Rule 1", project_id: 1 });
      
      const status = getStatus(ctx, 1);
      
      expect(status.typeBreakdown).toHaveLength(2);
      const patterns = status.typeBreakdown.find(t => t.concept_type === "pattern");
      expect(patterns?.count).toBe(2);
    });

    test("returns index stats", () => {
      const status = getStatus(ctx, 1);
      
      expect(status.index).not.toBeNull();
      expect(status.index?.chunkCount).toBe(100);
      expect(status.index?.lastIndexedAt).toBeDefined();
    });

    test("handles null project (global)", () => {
      addMemory(ctx, { concept_type: "rule", content: "Global rule", project_id: null });
      
      const status = getStatus(ctx, null);
      
      expect(status.projectId).toBeNull();
      expect(status.projectPath).toBeNull();
      expect(status.memories.total).toBe(1);
    });
  });

  describe("formatStatus", () => {
    test("formats project status", () => {
      addMemory(ctx, { concept_type: "pattern", content: "Test pattern", project_id: 1 });
      const m = addMemory(ctx, { concept_type: "rule", content: "Golden rule", project_id: 1 });
      ctx.db.exec(`UPDATE memories SET is_golden = 1 WHERE id = ${m.id}`);
      
      const status = getStatus(ctx, 1);
      const formatted = formatStatus(status);
      
      expect(formatted).toContain("Test Project");
      expect(formatted).toContain("/test/project");
      expect(formatted).toContain("100 chunks");
      expect(formatted).toContain("⭐ 1 golden");
      expect(formatted).toContain("1 regular");
    });

    test("formats global status", () => {
      const status = getStatus(ctx, null);
      const formatted = formatStatus(status);
      
      expect(formatted).toContain("Global");
    });

    test("shows freshness indicator", () => {
      const status = getStatus(ctx, 1);
      const formatted = formatStatus(status);
      
      expect(formatted).toContain("✅");
    });
  });
});
