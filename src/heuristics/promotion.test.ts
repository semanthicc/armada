import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestContext, type TestContext } from "../db/test-utils";
import { addMemory, promoteMemory, demoteMemory, getMemory } from "../heuristics/repository";

describe("Knowledge Mobility: Promotion/Demotion", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
    ctx.db.exec("INSERT INTO projects (id, path, name) VALUES (1, '/project1', 'Project 1')");
    ctx.db.exec("INSERT INTO projects (id, path, name) VALUES (2, '/project2', 'Project 2')");
  });

  afterEach(() => {
    ctx.cleanup();
  });

  describe("promoteMemory", () => {
    test("promotes project memory to global", () => {
      const m = addMemory(ctx, { 
        concept_type: "pattern", 
        content: "Use React", 
        domain: "react", 
        project_id: 1 
      });
      
      const promoted = promoteMemory(ctx, m.id);
      
      expect(promoted?.project_id).toBeNull();
      expect(promoted?.domain).toBe("react");
    });

    test("blocks promotion of domain-less memory", () => {
      const m = addMemory(ctx, { 
        concept_type: "rule", 
        content: "Always write tests", 
        domain: undefined, 
        project_id: 1 
      });
      
      expect(() => {
        promoteMemory(ctx, m.id);
      }).toThrow("Cannot promote domain-less rule");
    });

    test("allows forced promotion of domain-less memory", () => {
      const m = addMemory(ctx, { 
        concept_type: "rule", 
        content: "Always write tests", 
        domain: undefined, 
        project_id: 1 
      });
      
      const promoted = promoteMemory(ctx, m.id, true);
      
      expect(promoted?.project_id).toBeNull();
    });

    test("idempotent for already global memory", () => {
      const m = addMemory(ctx, { 
        concept_type: "rule", 
        content: "Global rule", 
        domain: "general", 
        project_id: null 
      });
      
      const promoted = promoteMemory(ctx, m.id);
      expect(promoted?.project_id).toBeNull();
    });
  });

  describe("demoteMemory", () => {
    test("demotes global memory to project", () => {
      const m = addMemory(ctx, { 
        concept_type: "pattern", 
        content: "Use React", 
        domain: "react", 
        project_id: null 
      });
      
      const demoted = demoteMemory(ctx, m.id, 1);
      
      expect(demoted?.project_id).toBe(1);
    });

    test("moves memory from one project to another", () => {
      const m = addMemory(ctx, { 
        concept_type: "pattern", 
        content: "Use React", 
        domain: "react", 
        project_id: 1 
      });
      
      const moved = demoteMemory(ctx, m.id, 2);
      
      expect(moved?.project_id).toBe(2);
    });

    test("idempotent if already in target project", () => {
      const m = addMemory(ctx, { 
        concept_type: "pattern", 
        content: "Use React", 
        domain: "react", 
        project_id: 1 
      });
      
      const demoted = demoteMemory(ctx, m.id, 1);
      expect(demoted?.project_id).toBe(1);
    });
  });
});
