import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { getDb, resetDb, clearAllTables } from "../db";
import { indexProject } from "../indexer";
import { searchCode } from "./search";
import { formatSearchResults, formatSearchResultsForTool } from "./format";
import { unloadModel } from "../embeddings";

function getTestDir(): string {
  return join(tmpdir(), `semanthicc-search-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function getTestDbPath(): string {
  return join(tmpdir(), `semanthicc-search-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe("Search", () => {
  let testDir: string;
  let testDbPath: string;
  let projectId: number;

  beforeEach(async () => {
    testDir = getTestDir();
    testDbPath = getTestDbPath();
    
    mkdirSync(join(testDir, "src"), { recursive: true });
    
    writeFileSync(join(testDir, "src", "auth.ts"), `
export function verifyToken(token: string): boolean {
  // Verify JWT authentication token
  if (!token) return false;
  return token.startsWith("Bearer ");
}

export function hashPassword(password: string): string {
  // Securely hash the password using bcrypt
  return password;
}
    `.trim());
    
    writeFileSync(join(testDir, "src", "database.ts"), `
export class DatabaseConnection {
  private pool: any;
  
  async connect(connectionString: string): Promise<void> {
    // Connect to PostgreSQL database
    this.pool = connectionString;
  }
  
  async query(sql: string): Promise<any[]> {
    // Execute SQL query
    return [];
  }
}
    `.trim());
    
    writeFileSync(join(testDir, "src", "utils.ts"), `
export function formatDate(date: Date): string {
  return date.toISOString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
    `.trim());
    
    getDb(testDbPath);
    clearAllTables();
    const result = await indexProject(testDir);
    projectId = result.projectId;
  }, 60000);

  afterEach(() => {
    resetDb();
    unloadModel();
    
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    if (existsSync(testDbPath)) {
      try { unlinkSync(testDbPath); } catch {}
      try { unlinkSync(testDbPath + "-wal"); } catch {}
      try { unlinkSync(testDbPath + "-shm"); } catch {}
    }
  });

  test("searchCode finds relevant auth code", async () => {
    const results = await searchCode("authentication token verification", projectId);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.filePath).toContain("auth.ts");
    expect(results[0]?.similarity).toBeGreaterThan(0.3);
  }, 30000);

  test("searchCode finds database code", async () => {
    const results = await searchCode("connect to database", projectId);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.filePath).toContain("database.ts");
  }, 30000);

  test("searchCode respects limit", async () => {
    const results = await searchCode("function", projectId, 2);
    
    expect(results.length).toBeLessThanOrEqual(2);
  }, 30000);

  test("searchCode returns empty for non-existent project", async () => {
    const results = await searchCode("anything", 99999);
    
    expect(results.length).toBe(0);
  }, 30000);
});

describe("Format", () => {
  test("formatSearchResults creates readable output", () => {
    const results = [
      {
        id: 1,
        filePath: "src/auth.ts",
        chunkStart: 1,
        chunkEnd: 10,
        content: "export function verifyToken() {\n  return true;\n}",
        similarity: 0.85,
      },
    ];
    
    const formatted = formatSearchResults(results);
    
    expect(formatted.length).toBe(1);
    expect(formatted[0]?.file).toBe("src/auth.ts");
    expect(formatted[0]?.lines).toBe("1-10");
    expect(formatted[0]?.similarity).toBe("85.0%");
  });

  test("formatSearchResultsForTool creates markdown", () => {
    const results = [
      {
        id: 1,
        filePath: "src/auth.ts",
        chunkStart: 1,
        chunkEnd: 10,
        content: "export function verifyToken() {}",
        similarity: 0.85,
      },
    ];
    
    const output = formatSearchResultsForTool(results);
    
    expect(output).toContain("**1. src/auth.ts**");
    expect(output).toContain("85.0%");
    expect(output).toContain("```");
  });

  test("formatSearchResultsForTool handles empty results", () => {
    const output = formatSearchResultsForTool([]);
    expect(output).toBe("No results found.");
  });
});
