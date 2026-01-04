import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { getDb, resetDb, clearAllTables } from "./db";
import { join } from "node:path";
import { unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { SemanthiccPlugin } from "./index";
import { registerProject } from "./hooks/project-detect";
import { addMemory } from "./heuristics";

function getTestDbPath(): string {
  return join(tmpdir(), `semanthicc-plugin-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

let testDbPath: string;

function cleanupTestDb(): void {
  resetDb();
  if (testDbPath && existsSync(testDbPath)) {
    try {
      unlinkSync(testDbPath);
      unlinkSync(`${testDbPath}-wal`);
      unlinkSync(`${testDbPath}-shm`);
    } catch {}
  }
}

function mockPluginInput(directory: string) {
  return {
    directory,
    client: {} as never,
    project: "" as never,
    worktree: "" as never,
    serverUrl: "" as never,
    $: {} as never,
  };
}

type ChatParamsHook = (params: Record<string, unknown>) => Promise<void>;
type SystemTransformHook = (input: Record<string, unknown>, output: { system: string[] }) => Promise<void>;

describe("Plugin", () => {
  beforeEach(() => {
    testDbPath = getTestDbPath();
    const db = getDb(testDbPath);
    clearAllTables(db);
  });

  afterEach(() => {
    cleanupTestDb();
  });

  test("exports plugin function", () => {
    expect(typeof SemanthiccPlugin).toBe("function");
  });

  test("plugin returns correct structure", async () => {
    const plugin = await SemanthiccPlugin(mockPluginInput("/test"));
    
    expect(plugin["chat.params"]).toBeDefined();
    expect(plugin["experimental.chat.system.transform"]).toBeDefined();
    expect(plugin.tool).toBeDefined();
    expect(plugin.tool?.semanthicc).toBeDefined();
  });

  test("chat.params injects heuristics into systemPrompt", async () => {
    const project = registerProject("/test/project", "Test");
    addMemory({
      concept_type: "pattern",
      content: "Always use TypeScript strict mode",
      project_id: project.id,
    });

    const plugin = await SemanthiccPlugin(mockPluginInput("/test/project"));
    const params = { input: { systemPrompt: "Base prompt" } };
    
    const chatParams = plugin["chat.params"] as unknown as ChatParamsHook;
    await chatParams(params);
    
    const systemPrompt = params.input.systemPrompt as string;
    expect(systemPrompt).toContain("Always use TypeScript strict mode");
    expect(systemPrompt).toContain("<project-heuristics>");
  });

  test("experimental.chat.system.transform injects heuristics", async () => {
    const project = registerProject("/test/project2", "Test2");
    addMemory({
      concept_type: "pattern",
      content: "Use bun:sqlite always",
      project_id: project.id,
    });

    const plugin = await SemanthiccPlugin(mockPluginInput("/test/project2"));
    const output = { system: [] as string[] };
    
    const transform = plugin["experimental.chat.system.transform"] as unknown as SystemTransformHook;
    await transform({}, output);
    
    expect(output.system.length).toBe(1);
    expect(output.system[0]).toContain("Use bun:sqlite always");
  });

  test("chat.params includes global heuristics", async () => {
    addMemory({
      concept_type: "rule",
      content: "Never use any type",
      project_id: null,
    });

    const plugin = await SemanthiccPlugin(mockPluginInput("/unknown/path"));
    const params = { input: { systemPrompt: "" } };
    
    const chatParams = plugin["chat.params"] as unknown as ChatParamsHook;
    await chatParams(params);
    
    const systemPrompt = params.input.systemPrompt as string;
    expect(systemPrompt).toContain("[global]");
    expect(systemPrompt).toContain("Never use any type");
  });

  test("chat.params skips when no heuristics", async () => {
    const plugin = await SemanthiccPlugin(mockPluginInput("/empty/project"));
    const params = { input: { systemPrompt: "Original" } };
    
    const chatParams = plugin["chat.params"] as unknown as ChatParamsHook;
    await chatParams(params);
    
    expect(params.input.systemPrompt).toBe("Original");
  });

  test("experimental.chat.system.transform skips when no heuristics", async () => {
    const plugin = await SemanthiccPlugin(mockPluginInput("/empty/project2"));
    const output = { system: ["existing"] };
    
    const transform = plugin["experimental.chat.system.transform"] as unknown as SystemTransformHook;
    await transform({}, output);
    
    expect(output.system.length).toBe(1);
    expect(output.system[0]).toBe("existing");
  });
});
