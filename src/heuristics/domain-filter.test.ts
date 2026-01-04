import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestContext, type TestContext } from "../db/test-utils";
import { addMemory, listMemories } from "../heuristics/repository";

describe("Domain-Filtered listMemories", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
    ctx.db.exec("INSERT INTO projects (id, path, name) VALUES (1, '/test', 'test')");
    
    addMemory(ctx, { concept_type: "pattern", content: "Svelte tip: use $: for reactivity", domain: "svelte", project_id: 1 });
    addMemory(ctx, { concept_type: "pattern", content: "React tip: use useMemo for expensive computations", domain: "react", project_id: 1 });
    addMemory(ctx, { concept_type: "pattern", content: "TypeScript tip: prefer unknown over any", domain: "typescript", project_id: 1 });
    addMemory(ctx, { concept_type: "rule", content: "General rule: always write tests", project_id: 1 });
    addMemory(ctx, { concept_type: "rule", content: "Global rule: no console.log in production", project_id: undefined });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  describe("Single domain filter", () => {
    test("filters by single domain using legacy 'domain' option", () => {
      const memories = listMemories(ctx, { projectId: 1, domain: "svelte" });
      
      expect(memories).toHaveLength(1);
      expect(memories[0]!.content).toContain("Svelte");
    });
  });

  describe("Multiple domains filter", () => {
    test("filters by multiple domains", () => {
      const memories = listMemories(ctx, { projectId: 1, domains: ["svelte", "react"] });
      
      const contents = memories.map(m => m.content);
      expect(contents.some(c => c.includes("Svelte"))).toBe(true);
      expect(contents.some(c => c.includes("React"))).toBe(true);
      expect(contents.some(c => c.includes("TypeScript"))).toBe(false);
    });

    test("includes null-domain memories when filtering by domains", () => {
      const memories = listMemories(ctx, { projectId: 1, domains: ["svelte"] });
      
      const contents = memories.map(m => m.content);
      expect(contents.some(c => c.includes("Svelte"))).toBe(true);
      expect(contents.some(c => c.includes("always write tests"))).toBe(true);
    });

    test("includes global null-domain memories with includeGlobal", () => {
      const memories = listMemories(ctx, { projectId: 1, domains: ["svelte"], includeGlobal: true });
      
      const contents = memories.map(m => m.content);
      expect(contents.some(c => c.includes("Svelte"))).toBe(true);
      expect(contents.some(c => c.includes("no console.log"))).toBe(true);
    });
  });

  describe("No domain filter", () => {
    test("returns all memories when no domain specified", () => {
      const memories = listMemories(ctx, { projectId: 1 });
      
      expect(memories.length).toBeGreaterThanOrEqual(4);
    });

    test("empty domains array returns all memories", () => {
      const memories = listMemories(ctx, { projectId: 1, domains: [] });
      
      expect(memories.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("Domain isolation", () => {
    test("svelte domain does not include react memories", () => {
      const memories = listMemories(ctx, { projectId: 1, domains: ["svelte"] });
      
      const contents = memories.map(m => m.content);
      expect(contents.some(c => c.includes("React"))).toBe(false);
    });

    test("react domain does not include svelte memories", () => {
      const memories = listMemories(ctx, { projectId: 1, domains: ["react"] });
      
      const contents = memories.map(m => m.content);
      expect(contents.some(c => c.includes("Svelte"))).toBe(false);
    });
  });
});
