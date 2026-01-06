import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getOrCreateProject } from "./auto-register";
import { getDb, closeDb, clearAllTables } from "../db";

describe("getOrCreateProject", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `auto-register-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    const db = getDb();
    db.prepare("DELETE FROM projects WHERE path LIKE ?").run(`%auto-register-test-%`);
  });

  test("returns null when not in a git repo", () => {
    const deepDir = join(testDir, "a", "b", "c");
    mkdirSync(deepDir, { recursive: true });

    expect(getOrCreateProject(deepDir)).toBeNull();
  });

  test("auto-registers project when in git repo", () => {
    mkdirSync(join(testDir, ".git"));

    const project = getOrCreateProject(testDir);

    expect(project).not.toBeNull();
    expect(project!.path.replace(/\\/g, "/")).toBe(testDir.replace(/\\/g, "/"));
  });

  test("registers from nested directory using git root", () => {
    mkdirSync(join(testDir, ".git"));
    const deepDir = join(testDir, "src", "components", "ui");
    mkdirSync(deepDir, { recursive: true });

    const project = getOrCreateProject(deepDir);

    expect(project).not.toBeNull();
    expect(project!.path.replace(/\\/g, "/")).toBe(testDir.replace(/\\/g, "/"));
  });

  test("uses folder name as project name", () => {
    const projectName = `test-project-${Date.now()}`;
    const projectDir = join(testDir, projectName);
    mkdirSync(join(projectDir, ".git"), { recursive: true });

    const project = getOrCreateProject(projectDir);

    expect(project).not.toBeNull();
    expect(project!.name).toBe(projectName);
  });

  test("returns existing project on subsequent calls", () => {
    mkdirSync(join(testDir, ".git"));

    const first = getOrCreateProject(testDir);
    const second = getOrCreateProject(testDir);

    expect(first!.id).toBe(second!.id);
  });

  test("returns existing project when called from different nested dirs", () => {
    mkdirSync(join(testDir, ".git"));
    const srcDir = join(testDir, "src");
    const testsDir = join(testDir, "tests");
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(testsDir, { recursive: true });

    const fromSrc = getOrCreateProject(srcDir);
    const fromTests = getOrCreateProject(testsDir);

    expect(fromSrc!.id).toBe(fromTests!.id);
  });
});
