import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { getDb, resetDb } from "./db";
import { join } from "node:path";
import { unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import semanthiccPlugin from "./index";
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
      const walPath = `${testDbPath}-wal`;
      const shmPath = `${testDbPath}-shm`;
      if (existsSync(walPath)) unlinkSync(walPath);
      if (existsSync(shmPath)) unlinkSync(shmPath);
    } catch {
      // Windows file lock
    }
  }
}

describe("Plugin", () => {
  beforeEach(() => {
    testDbPath = getTestDbPath();
    getDb(testDbPath);
  });

  afterEach(() => {
    cleanupTestDb();
  });

  test("exports plugin function", () => {
    expect(typeof semanthiccPlugin).toBe("function");
  });

  test("plugin returns correct structure", async () => {
    const plugin = await semanthiccPlugin({ directory: "/test" });
    
    expect(plugin.name).toBe("semanthicc");
    expect(plugin["experimental.chat.system.transform"]).toBeDefined();
    expect(plugin.tool).toBeDefined();
  });

  test("system transform injects heuristics", async () => {
    const project = registerProject("/test/project", "Test");
    addMemory({
      concept_type: "pattern",
      content: "Always use TypeScript strict mode",
      project_id: project.id,
    });

    const plugin = await semanthiccPlugin({ directory: "/test/project" });
    const output = { system: [] as string[] };
    
    await plugin["experimental.chat.system.transform"]!({ messages: [] }, output);
    
    expect(output.system.length).toBe(1);
    expect(output.system[0]).toContain("Always use TypeScript strict mode");
    expect(output.system[0]).toContain("<project-heuristics>");
  });

  test("system transform includes global heuristics", async () => {
    addMemory({
      concept_type: "rule",
      content: "Never use any type",
      project_id: null,
    });

    const plugin = await semanthiccPlugin({ directory: "/unknown/path" });
    const output = { system: [] as string[] };
    
    await plugin["experimental.chat.system.transform"]!({ messages: [] }, output);
    
    expect(output.system.length).toBe(1);
    expect(output.system[0]).toContain("[global]");
    expect(output.system[0]).toContain("Never use any type");
  });

  test("system transform skips when no heuristics", async () => {
    const plugin = await semanthiccPlugin({ directory: "/empty/project" });
    const output = { system: [] as string[] };
    
    await plugin["experimental.chat.system.transform"]!({ messages: [] }, output);
    
    expect(output.system.length).toBe(0);
  });
});
