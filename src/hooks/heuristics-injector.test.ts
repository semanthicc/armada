import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestContext, type TestContext } from "../db/test-utils";
import { getHeuristicsContext } from "./heuristics-injector";

describe("Heuristics Injector", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
    ctx.db.exec("INSERT INTO projects (id, path, name) VALUES (2, '/test', 'test-project')");
  });

  afterEach(() => {
    ctx.cleanup();
  });

  test("injects heuristics without warnings when query doesn't match", () => {
    ctx.db.exec(`INSERT INTO memories (concept_type, content, project_id) VALUES ('pattern', 'Test Pattern', 2)`);
    
    const context = getHeuristicsContext(ctx, 2, "unrelated query");
    expect(context).toContain("Test Pattern");
    expect(context).not.toContain("failure-warnings");
  });

  test("injects failure warnings when query matches", () => {
    const keywords = JSON.stringify(["file", "not", "found"]);
    ctx.db.exec(`
      INSERT INTO memories (concept_type, content, source, keywords, project_id)
      VALUES ('learning', 'File not found error', 'passive', '${keywords}', 2)
    `);

    const context = getHeuristicsContext(ctx, 2, "why is file not found?");
    expect(context).toContain("failure-warnings");
    expect(context).toContain("File not found error");
  });

  test("combines heuristics and warnings", () => {
    ctx.db.exec(`INSERT INTO memories (concept_type, content, project_id) VALUES ('pattern', 'Regular Pattern', 2)`);
    
    const keywords = JSON.stringify(["database", "connection"]);
    ctx.db.exec(`
      INSERT INTO memories (concept_type, content, source, keywords, project_id)
      VALUES ('learning', 'Past DB Error', 'passive', '${keywords}', 2)
    `);

    const context = getHeuristicsContext(ctx, 2, "database connection failed");
    expect(context).toContain("project-heuristics");
    expect(context).toContain("Regular Pattern");
    expect(context).toContain("failure-warnings");
    expect(context).toContain("Past DB Error");
  });
});
