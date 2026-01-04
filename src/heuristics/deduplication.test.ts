import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestContext, type TestContext } from "../db/test-utils";
import { addMemory, DuplicateMemoryError } from "../heuristics/repository";

describe("Exact-Match Deduplication", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
    ctx.db.exec("INSERT INTO projects (id, path, name) VALUES (1, '/project1', 'Project 1')");
    ctx.db.exec("INSERT INTO projects (id, path, name) VALUES (2, '/project2', 'Project 2')");
  });

  afterEach(() => {
    ctx.cleanup();
  });

  test("rejects exact duplicate in same project", () => {
    addMemory(ctx, { concept_type: "pattern", content: "Never use any", project_id: 1 });
    
    expect(() => {
      addMemory(ctx, { concept_type: "pattern", content: "Never use any", project_id: 1 });
    }).toThrow(DuplicateMemoryError);
  });

  test("rejects exact duplicate in global scope", () => {
    addMemory(ctx, { concept_type: "rule", content: "Global rule", project_id: null });
    
    expect(() => {
      addMemory(ctx, { concept_type: "rule", content: "Global rule", project_id: null });
    }).toThrow(DuplicateMemoryError);
  });

  test("allows same content in different projects", () => {
    addMemory(ctx, { concept_type: "pattern", content: "Use TypeScript", project_id: 1 });
    
    const m2 = addMemory(ctx, { concept_type: "pattern", content: "Use TypeScript", project_id: 2 });
    expect(m2.id).toBeDefined();
  });

  test("allows same content in project vs global", () => {
    addMemory(ctx, { concept_type: "pattern", content: "Use strict mode", project_id: null });
    
    const m2 = addMemory(ctx, { concept_type: "pattern", content: "Use strict mode", project_id: 1 });
    expect(m2.id).toBeDefined();
  });

  test("allows similar but not exact content", () => {
    addMemory(ctx, { concept_type: "pattern", content: "Use React Query", project_id: 1 });
    
    const m2 = addMemory(ctx, { concept_type: "pattern", content: "Use React Router", project_id: 1 });
    expect(m2.id).toBeDefined();
  });

  test("allows duplicate after original is superseded", () => {
    const m1 = addMemory(ctx, { concept_type: "pattern", content: "Old pattern", project_id: 1 });
    ctx.db.exec(`UPDATE memories SET status = 'superseded' WHERE id = ${m1.id}`);
    
    const m2 = addMemory(ctx, { concept_type: "pattern", content: "Old pattern", project_id: 1 });
    expect(m2.id).toBeDefined();
    expect(m2.id).not.toBe(m1.id);
  });

  test("allows duplicate after original is archived", () => {
    const m1 = addMemory(ctx, { concept_type: "learning", content: "Archived learning", project_id: 1 });
    ctx.db.exec(`UPDATE memories SET status = 'archived' WHERE id = ${m1.id}`);
    
    const m2 = addMemory(ctx, { concept_type: "learning", content: "Archived learning", project_id: 1 });
    expect(m2.id).toBeDefined();
  });

  test("error includes existing memory id", () => {
    const m1 = addMemory(ctx, { concept_type: "rule", content: "Unique rule", project_id: 1 });
    
    let caught: DuplicateMemoryError | null = null;
    try {
      addMemory(ctx, { concept_type: "rule", content: "Unique rule", project_id: 1 });
    } catch (e) {
      caught = e as DuplicateMemoryError;
    }
    
    expect(caught).toBeInstanceOf(DuplicateMemoryError);
    expect(caught?.existingId).toBe(m1.id);
  });

  test("different concept_type with same content is allowed", () => {
    addMemory(ctx, { concept_type: "pattern", content: "Same content", project_id: 1 });
    
    const m2 = addMemory(ctx, { concept_type: "rule", content: "Same content", project_id: 1 });
    expect(m2.id).toBeDefined();
  });
});
