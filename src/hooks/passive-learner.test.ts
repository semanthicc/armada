import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestContext, type TestContext } from "../db/test-utils";
import { createPassiveLearner, PASSIVE_CONFIG } from "./passive-learner";
import { listMemories, getMemory } from "../heuristics/repository";

describe("Passive Learner", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
    ctx.db.exec("INSERT INTO projects (id, path, name) VALUES (3, '/test', 'test-project')");
  });

  afterEach(() => {
    ctx.cleanup();
  });

  test("captures tool failures as memories", () => {
    const learner = createPassiveLearner(ctx, 3, "session-123");
    
    learner.handleToolOutcome(
      { tool: { name: "read", parameters: {} } },
      { content: "Error: ENOENT file not found: src/components/main.ts", isError: true }
    );

    const memories = listMemories(ctx, { conceptTypes: ["learning"], projectId: 3 });
    expect(memories).toHaveLength(1);
    const m = memories[0];
    if (!m) throw new Error("Memory not found");
    
    expect(m.content).toContain("file not found");
    expect(m.source).toBe("passive");
    expect(m.source_tool).toBe("read");
    expect(m.source_session_id).toBe("session-123");
  });

  test("ignores successful tool calls", () => {
    const learner = createPassiveLearner(ctx, 3, "session-123");
    
    learner.handleToolOutcome(
      { tool: { name: "read", parameters: {} } },
      { content: "File content here...", isError: false }
    );

    const memories = listMemories(ctx, { conceptTypes: ["learning"] });
    expect(memories).toHaveLength(0);
  });

  test("ignores tools with too few keywords", () => {
    const learner = createPassiveLearner(ctx, 3, "session-123");
    
    learner.handleToolOutcome(
      { tool: { name: "read", parameters: {} } },
      { content: "Error: No", isError: true } 
    );

    const memories = listMemories(ctx, { conceptTypes: ["learning"] });
    expect(memories).toHaveLength(0);
  });

  test("truncates long error messages", () => {
    const learner = createPassiveLearner(ctx, 3, "session-123");
    
    const prefix = "TypeError: Cannot read property map of undefined in component "; 
    const longContent = prefix + "a".repeat(PASSIVE_CONFIG.MAX_CONTENT_LENGTH + 100);
    
    learner.handleToolOutcome(
      { tool: { name: "read", parameters: {} } },
      { content: longContent, isError: true }
    );

    const memories = listMemories(ctx, { conceptTypes: ["learning"], projectId: 3 });
    expect(memories).toHaveLength(1);
    const m = memories[0];
    if (!m) throw new Error("Memory not found");

    expect(m.content.length).toBeLessThan(longContent.length);
    expect(m.content).toEndWith("...");
  });

  test("ignores ignored tools", () => {
    const learner = createPassiveLearner(ctx, 3, "session-123");
    
    learner.handleToolOutcome(
      { tool: { name: "todoread", parameters: {} } },
      { content: "Error reading todo", isError: true }
    );

    const memories = listMemories(ctx, { conceptTypes: ["learning"] });
    expect(memories).toHaveLength(0);
  });

  test("archives failure when tool succeeds later in session", () => {
    const learner = createPassiveLearner(ctx, 3, "session-123");
    
    learner.handleToolOutcome(
      { tool: { name: "read", parameters: {} } },
      { content: "Error: ENOENT file missing from src/components/Button.tsx", isError: true }
    );

    let memories = listMemories(ctx, { conceptTypes: ["learning"], projectId: 3 });
    expect(memories).toHaveLength(1);
    const m1 = memories[0];
    if (!m1) throw new Error("Memory not found");
    expect(m1.status).toBe("current");

    learner.handleToolOutcome(
      { tool: { name: "read", parameters: {} } },
      { content: "Success", isError: false }
    );

    const m = getMemory(ctx, m1.id);
    expect(m).not.toBeNull();
    expect(m!.status).toBe("archived");
  });
});
