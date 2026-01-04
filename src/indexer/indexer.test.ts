import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { getDb, resetDb, clearAllTables } from "../db";
import { shouldExclude, isCodeFile } from "./exclusions";
import { splitIntoChunks } from "./chunker";
import { walkProject } from "./walker";
import { hashFile, hashContent } from "./hasher";
import { indexProject, getIndexStats } from "./indexer";

function getTestDir(): string {
  return join(tmpdir(), `semanthicc-indexer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function getTestDbPath(): string {
  return join(tmpdir(), `semanthicc-indexer-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe("Exclusions", () => {
  test("shouldExclude matches node_modules", () => {
    expect(shouldExclude("node_modules/package/index.js")).toBe(true);
  });

  test("shouldExclude matches .git", () => {
    expect(shouldExclude(".git/config")).toBe(true);
  });

  test("shouldExclude allows src files", () => {
    expect(shouldExclude("src/index.ts")).toBe(false);
  });

  test("isCodeFile recognizes TypeScript", () => {
    expect(isCodeFile("src/index.ts")).toBe(true);
    expect(isCodeFile("src/component.tsx")).toBe(true);
  });

  test("isCodeFile rejects images", () => {
    expect(isCodeFile("logo.png")).toBe(false);
    expect(isCodeFile("icon.svg")).toBe(false);
  });
});

describe("Chunker", () => {
  test("splits content into chunks", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}: ${"x".repeat(50)}`);
    const content = lines.join("\n");
    
    const chunks = splitIntoChunks(content);
    
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.startLine).toBe(1);
    expect(chunks[0]?.index).toBe(0);
  });

  test("preserves small files as single chunk", () => {
    const content = "const x = 1;\nconst y = 2;\nconst z = 3;";
    const chunks = splitIntoChunks(content);
    
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.content).toBe(content);
  });
});

describe("Hasher", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = getTestDir();
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("hashFile returns consistent SHA-256", () => {
    const filePath = join(testDir, "test.txt");
    writeFileSync(filePath, "hello world");
    
    const hash1 = hashFile(filePath);
    const hash2 = hashFile(filePath);
    
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });

  test("hashContent matches hashFile", () => {
    const content = "hello world";
    const filePath = join(testDir, "test.txt");
    writeFileSync(filePath, content);
    
    expect(hashContent(content)).toBe(hashFile(filePath));
  });
});

describe("Walker", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = getTestDir();
    mkdirSync(join(testDir, "src"), { recursive: true });
    mkdirSync(join(testDir, "node_modules", "pkg"), { recursive: true });
    
    writeFileSync(join(testDir, "src", "index.ts"), "export const x = 1;");
    writeFileSync(join(testDir, "src", "utils.ts"), "export const y = 2;");
    writeFileSync(join(testDir, "node_modules", "pkg", "index.js"), "module.exports = {};");
    writeFileSync(join(testDir, "README.md"), "# Test");
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("walks project and finds code files", () => {
    const files = walkProject(testDir);
    
    expect(files.length).toBe(3);
    expect(files.some(f => f.relativePath.includes("index.ts"))).toBe(true);
    expect(files.some(f => f.relativePath.includes("utils.ts"))).toBe(true);
    expect(files.some(f => f.relativePath.includes("README.md"))).toBe(true);
  });

  test("excludes node_modules", () => {
    const files = walkProject(testDir);
    
    expect(files.every(f => !f.relativePath.includes("node_modules"))).toBe(true);
  });

  test("respects maxFiles limit", () => {
    const files = walkProject(testDir, { maxFiles: 1 });
    
    expect(files.length).toBe(1);
  });
});

describe("Indexer Integration", () => {
  let testDir: string;
  let testDbPath: string;

  beforeEach(() => {
    testDir = getTestDir();
    testDbPath = getTestDbPath();
    
    mkdirSync(join(testDir, "src"), { recursive: true });
    writeFileSync(join(testDir, "src", "auth.ts"), `
export function verifyToken(token: string): boolean {
  // Verify JWT token
  return token.startsWith("Bearer ");
}

export function hashPassword(password: string): string {
  // Hash password securely
  return password;
}
    `.trim());
    
    writeFileSync(join(testDir, "src", "utils.ts"), `
export function formatDate(date: Date): string {
  return date.toISOString();
}
    `.trim());
    
    getDb(testDbPath);
    clearAllTables();
  });

  afterEach(() => {
    resetDb();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("indexes project and creates embeddings", async () => {
    const result = await indexProject(testDir, { projectName: "Test Project" });
    
    expect(result.filesIndexed).toBe(2);
    expect(result.chunksCreated).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThan(0);
  }, 60000);

  test("getIndexStats returns correct counts", async () => {
    const result = await indexProject(testDir);
    const stats = getIndexStats(result.projectId);
    
    expect(stats.chunkCount).toBe(result.chunksCreated);
    expect(stats.fileCount).toBe(2);
    expect(stats.staleCount).toBe(0);
  }, 60000);
});
