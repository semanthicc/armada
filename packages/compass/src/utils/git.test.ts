import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { findGitRoot } from "./git";

describe("findGitRoot", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `git-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("returns null when not in a git repo", () => {
    const deepDir = join(testDir, "a", "b", "c");
    mkdirSync(deepDir, { recursive: true });

    expect(findGitRoot(deepDir)).toBeNull();
  });

  test("finds git root when cwd is at root", () => {
    mkdirSync(join(testDir, ".git"));

    expect(findGitRoot(testDir)).toBe(testDir);
  });

  test("finds git root from nested directory", () => {
    mkdirSync(join(testDir, ".git"));
    const deepDir = join(testDir, "src", "components", "ui");
    mkdirSync(deepDir, { recursive: true });

    expect(findGitRoot(deepDir)).toBe(testDir);
  });

  test("handles .git file (worktree/submodule)", () => {
    writeFileSync(join(testDir, ".git"), "gitdir: /some/path");

    expect(findGitRoot(testDir)).toBe(testDir);
  });

  test("finds nearest git root when nested repos exist", () => {
    mkdirSync(join(testDir, ".git"));
    const nestedRepo = join(testDir, "packages", "inner");
    mkdirSync(join(nestedRepo, ".git"), { recursive: true });

    expect(findGitRoot(nestedRepo)).toBe(nestedRepo);
    expect(findGitRoot(testDir)).toBe(testDir);
  });

  test("handles relative-like paths by resolving", () => {
    mkdirSync(join(testDir, ".git"));
    const srcDir = join(testDir, "src");
    mkdirSync(srcDir);

    expect(findGitRoot(srcDir)).toBe(testDir);
  });
});
