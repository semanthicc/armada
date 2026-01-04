import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { startDashboard, stopDashboard } from "./server";
import { createTestContext, type TestContext } from "../db/test-utils";
import { addMemory } from "../heuristics/repository";

describe("Dashboard Server", () => {
  let ctx: TestContext;
  let port: number;
  let basePort = 14567;

  beforeEach(() => {
    stopDashboard();
    ctx = createTestContext();
    ctx.db.exec("INSERT INTO projects (id, path, name) VALUES (1, '/test', 'Test Project')");
    basePort += 50; // Increment base port for each test to avoid overlap
  });

  afterEach(() => {
    stopDashboard();
    ctx.cleanup();
  });

  test("starts and stops server", () => {
    const result = startDashboard(basePort, 1, ctx);
    expect(result.port).not.toBeNull();
    expect(result.message).toContain("started at");
    
    const stopMsg = stopDashboard();
    expect(stopMsg).toBe("Dashboard stopped");
  });

  test("serves status API", async () => {
    const result = startDashboard(basePort, 1, ctx);
    port = result.port!;
    
    const res = await fetch(`http://localhost:${port}/api/status`);
    expect(res.ok).toBe(true);
    
    const data = await res.json() as any;
    expect(data.projectName).toBe("Test Project");
    expect(data.memories.total).toBe(0);
  });

  test("serves memories API", async () => {
    addMemory(ctx, { concept_type: "pattern", content: "Test Pattern", project_id: 1 });
    const result = startDashboard(basePort, 1, ctx);
    port = result.port!;
    
    const res = await fetch(`http://localhost:${port}/api/memories`);
    if (!res.ok) {
      console.error(await res.text());
    }
    expect(res.ok).toBe(true);
    
    const data = await res.json() as any[];
    expect(data).toHaveLength(1);
    expect(data[0].content).toBe("Test Pattern");
  });

  test("serves static HTML", async () => {
    const result = startDashboard(basePort, 1, ctx);
    port = result.port!;
    
    const res = await fetch(`http://localhost:${port}/`);
    expect(res.ok).toBe(true);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    
    const html = await res.text();
    expect(html).toMatch(/<!doctype html>/i);
  });

  test("handles 404", async () => {
    const result = startDashboard(basePort, 1, ctx);
    port = result.port!;
    
    const res = await fetch(`http://localhost:${port}/api/unknown`);
    expect(res.status).toBe(404);
  });
});
