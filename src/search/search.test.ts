import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { createTestContext, type TestContext } from "../db/test-utils";
import { indexProject } from "../indexer";
import { searchCode } from "./search";
import { formatSearchResults, formatSearchResultsForTool } from "./format";
import { unloadModel } from "../embeddings";

function getTestDir(): string {
  return join(tmpdir(), `semanthicc-search-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe("Search", () => {
  let ctx: TestContext;
  let testDir: string;
  let projectId: number;

  beforeEach(async () => {
    ctx = createTestContext();
    testDir = getTestDir();
    
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
    
    const result = await indexProject(ctx, testDir);
    projectId = result.projectId;
  }, 60000);

  afterEach(() => {
    ctx.cleanup();
    unloadModel();
    
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("searchCode finds relevant auth code", async () => {
    const response = await searchCode(ctx, "authentication token verification", projectId);
    
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results[0]?.filePath).toContain("auth.ts");
    expect(response.searchType).toBeOneOf(["hybrid", "vector-only"]);
  }, 30000);

  test("searchCode finds database code", async () => {
    const response = await searchCode(ctx, "connect to database", projectId);
    
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results[0]?.filePath).toContain("database.ts");
  }, 30000);

  test("searchCode respects limit", async () => {
    const response = await searchCode(ctx, "function", projectId, 2);
    
    expect(response.results.length).toBeLessThanOrEqual(2);
  }, 30000);

  test("searchCode returns empty for non-existent project", async () => {
    const response = await searchCode(ctx, "anything", 99999);
    
    expect(response.results.length).toBe(0);
  }, 30000);

  test("searchCode returns search type info", async () => {
    const response = await searchCode(ctx, "authentication", projectId);
    
    expect(response).toHaveProperty("searchType");
    expect(response).toHaveProperty("ftsIndexed");
    expect(["hybrid", "vector-only"]).toContain(response.searchType);
    expect(typeof response.ftsIndexed).toBe("boolean");
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
    const response = {
      results: [
        {
          id: 1,
          filePath: "src/auth.ts",
          chunkStart: 1,
          chunkEnd: 10,
          content: "export function verifyToken() {}",
          similarity: 0.85,
        },
      ],
      searchType: "hybrid" as const,
      ftsIndexed: true,
    };
    
    const output = formatSearchResultsForTool(response);
    
    expect(output).toContain("[hybrid + FTS]");
    expect(output).toContain("**1. src/auth.ts**");
    expect(output).toContain("85.0%");
    expect(output).toContain("```");
  });

  test("formatSearchResultsForTool handles empty results", () => {
    const response = {
      results: [],
      searchType: "vector-only" as const,
      ftsIndexed: false,
    };
    const output = formatSearchResultsForTool(response);
    expect(output).toBe("No results found.");
  });

  test("formatSearchResultsForTool shows vector-only when no FTS", () => {
    const response = {
      results: [
        {
          id: 1,
          filePath: "src/test.ts",
          chunkStart: 1,
          chunkEnd: 5,
          content: "test",
          similarity: 0.5,
        },
      ],
      searchType: "vector-only" as const,
      ftsIndexed: false,
    };
    
    const output = formatSearchResultsForTool(response);
    expect(output).toContain("[vector-only]");
    expect(output).not.toContain("FTS");
  });
});
