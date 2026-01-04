import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { startDashboard, stopDashboard } from "./server";
import { createTestContext, type TestContext } from "../db/test-utils";
import { addMemory } from "../heuristics/repository";

describe("Dashboard Server", () => {
  let ctx: TestContext;
  const PORT = 14567;

  beforeEach(() => {
    ctx = createTestContext();
    ctx.db.exec("INSERT INTO projects (id, path, name) VALUES (1, '/test', 'Test Project')");
  });

  afterEach(() => {
    stopDashboard();
    ctx.cleanup();
  });

  test("starts and stops server", () => {
    const msg = startDashboard(PORT, 1, ctx);
    expect(msg).toContain(`started at http://localhost:${PORT}`);
    
    const stopMsg = stopDashboard();
    expect(stopMsg).toBe("Dashboard stopped");
  });

  test("serves status API", async () => {
    startDashboard(PORT, 1, ctx);
    
    const res = await fetch(`http://localhost:${PORT}/api/status`);
    expect(res.ok).toBe(true);
    
    const data = await res.json() as any;
    expect(data.projectName).toBe("Test Project");
    expect(data.memories.total).toBe(0);
  });

  test("serves memories API", async () => {
    addMemory(ctx, { concept_type: "pattern", content: "Test Pattern", project_id: 1 });
    startDashboard(PORT, 1, ctx);
    
    const res = await fetch(`http://localhost:${PORT}/api/memories`);
    expect(res.ok).toBe(true);
    
    const data = await res.json() as any[];
    expect(data).toHaveLength(1);
    expect(data[0].content).toBe("Test Pattern");
  });

  test("serves static HTML", async () => {
    startDashboard(PORT, 1, ctx);
    
    const res = await fetch(`http://localhost:${PORT}/`);
    expect(res.ok).toBe(true);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    
    const html = await res.text();
    expect(html).toMatch(/<!doctype html>/i);
  });

  test("handles 404", async () => {
    startDashboard(PORT, 1, ctx);
    
    const res = await fetch(`http://localhost:${PORT}/api/unknown`);
    expect(res.status).toBe(404);
  });
});
