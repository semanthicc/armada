import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestContext, type TestContext } from "../db/test-utils";
import { addMemory, listMemories } from "./repository";
import { exportMemories, importMemories } from "./transfer";

describe("Knowledge Mobility: Import/Export", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
    ctx.db.exec("INSERT INTO projects (id, path, name) VALUES (1, '/project1', 'Project 1')");
    ctx.db.exec("INSERT INTO projects (id, path, name) VALUES (2, '/project2', 'Project 2')");
  });

  afterEach(() => {
    ctx.cleanup();
  });

  test("exports project memories to JSON", () => {
    addMemory(ctx, { concept_type: "pattern", content: "Use React", domain: "react", project_id: 1 });
    addMemory(ctx, { concept_type: "rule", content: "No any", domain: "typescript", project_id: 1 });
    
    addMemory(ctx, { concept_type: "rule", content: "Global rule", project_id: null });
    addMemory(ctx, { concept_type: "pattern", content: "Project 2 pattern", project_id: 2 });
    
    const json = exportMemories(ctx, 1);
    const data = JSON.parse(json);
    
    expect(data).toHaveLength(2);
    expect(data.some((m: any) => m.content === "Use React")).toBe(true);
    expect(data.some((m: any) => m.content === "No any")).toBe(true);
  });

  test("imports memories from JSON", () => {
    const json = JSON.stringify([
      { content: "Imported pattern", concept_type: "pattern", domain: "test", confidence: 0.8 },
      { content: "Imported rule", concept_type: "rule", domain: "test", confidence: 0.9 }
    ]);
    
    const result = importMemories(ctx, 1, json);
    
    expect(result.added).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    
    const memories = listMemories(ctx, { projectId: 1 });
    expect(memories).toHaveLength(2);
    expect(memories.find(m => m.content === "Imported pattern")?.confidence).toBe(0.8);
  });

  test("skips duplicates during import", () => {
    addMemory(ctx, { concept_type: "pattern", content: "Existing pattern", project_id: 1 });
    
    const json = JSON.stringify([
      { content: "Existing pattern", concept_type: "pattern", domain: null, confidence: 0.5 },
      { content: "New pattern", concept_type: "pattern", domain: null, confidence: 0.5 }
    ]);
    
    const result = importMemories(ctx, 1, json);
    
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    
    const memories = listMemories(ctx, { projectId: 1 });
    expect(memories).toHaveLength(2);
  });

  test("handles invalid JSON gracefully", () => {
    const result = importMemories(ctx, 1, "invalid json");
    
    expect(result.added).toBe(0);
    expect(result.errors).toContain("Invalid JSON format");
  });

  test("handles invalid memory items gracefully", () => {
    const json = JSON.stringify([
      { content: "Valid", concept_type: "pattern" },
      { content: "Invalid (no type)" },
      { concept_type: "pattern" }
    ]);
    
    const result = importMemories(ctx, 1, json);
    
    expect(result.added).toBe(1);
    expect(result.errors).toHaveLength(2);
  });
});
