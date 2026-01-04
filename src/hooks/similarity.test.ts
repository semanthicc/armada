import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestContext, type TestContext } from "../db/test-utils";
import { jaccardSimilarity, findSimilarFailures } from "./similarity";

describe("Jaccard Similarity", () => {
  test("returns 1 for identical sets", () => {
    expect(jaccardSimilarity(["a", "b"], ["a", "b"])).toBe(1);
  });

  test("returns 0 for disjoint sets", () => {
    expect(jaccardSimilarity(["a", "b"], ["c", "d"])).toBe(0);
  });

  test("returns 0.5 for half overlap", () => {
    expect(jaccardSimilarity(["a", "b", "c"], ["b", "c", "d"])).toBe(0.5);
  });

  test("handles empty sets", () => {
    expect(jaccardSimilarity([], ["a"])).toBe(0);
    expect(jaccardSimilarity(["a"], [])).toBe(0);
    expect(jaccardSimilarity([], [])).toBe(0);
  });
});

describe("findSimilarFailures", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
    ctx.db.exec("INSERT INTO projects (id, path, name) VALUES (1, '/test', 'test-project')");
  });

  afterEach(() => {
    ctx.cleanup();
  });

  test("finds similar failures above threshold", () => {
    const keywords = JSON.stringify(["file", "not", "found", "error"]);
    
    ctx.db.exec(`
      INSERT INTO memories (concept_type, content, source, keywords, project_id)
      VALUES ('learning', 'File not found error', 'passive', '${keywords}', 1)
    `);

    const matches = findSimilarFailures(ctx, ["file", "found", "missing"], 1);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.content).toBe("File not found error");
  });

  test("ignores failures below threshold", () => {
    const keywords = JSON.stringify(["network", "timeout", "connection"]);
    
    ctx.db.exec(`
      INSERT INTO memories (concept_type, content, source, keywords, project_id)
      VALUES ('learning', 'Network timeout', 'passive', '${keywords}', 1)
    `);

    const matches = findSimilarFailures(ctx, ["file", "not", "found"], 1);
    expect(matches).toHaveLength(0);
  });

  test("respects project isolation", () => {
    ctx.db.exec("INSERT INTO projects (id, path, name) VALUES (2, '/test2', 'test-project-2')");
    const keywords = JSON.stringify(["file", "error"]);
    
    ctx.db.exec(`
      INSERT INTO memories (concept_type, content, source, keywords, project_id)
      VALUES ('learning', 'Project 2 error', 'passive', '${keywords}', 2)
    `);

    const matches = findSimilarFailures(ctx, ["file", "error"], 1);
    expect(matches).toHaveLength(0);
  });

  test("includes global memories", () => {
    const keywords = JSON.stringify(["global", "error"]);
    
    ctx.db.exec(`
      INSERT INTO memories (concept_type, content, source, keywords, project_id)
      VALUES ('learning', 'Global error', 'passive', '${keywords}', NULL)
    `);

    const matches = findSimilarFailures(ctx, ["global", "error"], 1);
    expect(matches).toHaveLength(1);
  });
});
