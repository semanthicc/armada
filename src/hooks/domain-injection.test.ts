import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestContext, type TestContext } from "../db/test-utils";
import { addMemory } from "../heuristics/repository";
import { getHeuristicsContext } from "./heuristics-injector";

describe("End-to-End Domain Injection", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
    ctx.db.exec("INSERT INTO projects (id, path, name) VALUES (1, '/test', 'test')");
    
    addMemory(ctx, { concept_type: "pattern", content: "Svelte: use $: for reactive statements", domain: "svelte", project_id: 1 });
    addMemory(ctx, { concept_type: "pattern", content: "React: prefer functional components", domain: "react", project_id: 1 });
    addMemory(ctx, { concept_type: "pattern", content: "TypeScript: use strict mode", domain: "typescript", project_id: 1 });
    addMemory(ctx, { concept_type: "rule", content: "General: always handle errors", project_id: 1 });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  test("query mentioning .svelte file gets svelte + general heuristics", () => {
    const context = getHeuristicsContext(ctx, 1, "Fix the Button.svelte component");
    
    expect(context).toContain("Svelte: use $:");
    expect(context).toContain("General: always handle errors");
    expect(context).not.toContain("React: prefer functional");
  });

  test("query mentioning .tsx file gets react + general heuristics", () => {
    const context = getHeuristicsContext(ctx, 1, "Update UserList.tsx");
    
    expect(context).toContain("React: prefer functional");
    expect(context).toContain("General: always handle errors");
    expect(context).not.toContain("Svelte: use $:");
  });

  test("query mentioning .ts file gets typescript + general heuristics", () => {
    const context = getHeuristicsContext(ctx, 1, "Check utils.ts for issues");
    
    expect(context).toContain("TypeScript: use strict");
    expect(context).toContain("General: always handle errors");
    expect(context).not.toContain("Svelte");
    expect(context).not.toContain("React");
  });

  test("query mentioning multiple file types gets all relevant domains", () => {
    const context = getHeuristicsContext(ctx, 1, "Fix App.svelte and utils.ts");
    
    expect(context).toContain("Svelte: use $:");
    expect(context).toContain("TypeScript: use strict");
    expect(context).toContain("General: always handle errors");
    expect(context).not.toContain("React");
  });

  test("query with no file extensions gets all heuristics", () => {
    const context = getHeuristicsContext(ctx, 1, "Help me with this code");
    
    expect(context).toContain("Svelte");
    expect(context).toContain("React");
    expect(context).toContain("TypeScript");
    expect(context).toContain("General");
  });

  test("query with unknown extension gets all heuristics", () => {
    const context = getHeuristicsContext(ctx, 1, "Check file.xyz");
    
    expect(context).toContain("Svelte");
    expect(context).toContain("React");
    expect(context).toContain("TypeScript");
    expect(context).toContain("General");
  });

  test("domain filtering works with full file paths", () => {
    const context = getHeuristicsContext(ctx, 1, "Edit src/components/Header.svelte");
    
    expect(context).toContain("Svelte: use $:");
    expect(context).not.toContain("React");
  });

  test("domain filtering is case insensitive", () => {
    const context = getHeuristicsContext(ctx, 1, "Fix Component.SVELTE");
    
    expect(context).toContain("Svelte: use $:");
    expect(context).not.toContain("React");
  });
});
