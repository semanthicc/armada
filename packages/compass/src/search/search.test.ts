import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { createTestContext, type TestContext } from "../db/test-utils";
import { indexProject, resetCircuitBreaker } from "../indexer";
import { searchCode } from "./search";
import { formatSearchResults, formatSearchResultsForTool } from "./format";
import { unloadModel, setTestEmbedder, createFakeEmbedding } from "../embeddings";

function getTestDir(): string {
  return join(tmpdir(), `semanthicc-search-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe("Search", () => {
  let ctx: TestContext;
  let testDir: string;
  let projectId: number;

  beforeEach(async () => {
    resetCircuitBreaker();
    setTestEmbedder((text) => Promise.resolve(createFakeEmbedding(text, 384)));
    
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
    setTestEmbedder(null);
    ctx.cleanup();
    unloadModel();
    
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("searchCode finds relevant auth code", async () => {
    const response = await searchCode("authentication token verification", projectId);
    
    expect(response.results.length).toBeGreaterThan(0);
    const hasAuthFile = response.results.some(r => r.filePath.includes("auth.ts"));
    expect(hasAuthFile).toBe(true);
    expect(response.searchType).toBeOneOf(["hybrid", "vector-only"]);
  }, 30000);

  test("searchCode finds database code", async () => {
    const response = await searchCode("connect to database", projectId);
    
    expect(response.results.length).toBeGreaterThan(0);
    const hasDbFile = response.results.some(r => r.filePath.includes("database.ts"));
    expect(hasDbFile).toBe(true);
  }, 30000);

  test("searchCode respects limit", async () => {
    const response = await searchCode("function", projectId, 2);
    
    expect(response.results.length).toBeLessThanOrEqual(2);
  }, 30000);

  test("searchCode returns empty for non-existent project", async () => {
    const response = await searchCode("anything", 99999);
    
    expect(response.results.length).toBe(0);
  }, 30000);

  test("searchCode returns search type info", async () => {
    const response = await searchCode("authentication", projectId);
    
    expect(response).toHaveProperty("searchType");
    expect(response).toHaveProperty("ftsIndexed");
    expect(["hybrid", "vector-only"]).toContain(response.searchType);
    expect(typeof response.ftsIndexed).toBe("boolean");
  }, 30000);
});

describe("Search focus filtering", () => {
  let ctx: TestContext;
  let testDir: string;
  let projectId: number;

  beforeEach(async () => {
    resetCircuitBreaker();
    setTestEmbedder((text) => Promise.resolve(createFakeEmbedding(text, 384)));
    
    ctx = createTestContext();
    testDir = getTestDir();
    
    // Create a mixed project with code, tests, and docs
    mkdirSync(join(testDir, "src"), { recursive: true });
    mkdirSync(join(testDir, "docs"), { recursive: true });
    
    // Production code
    writeFileSync(join(testDir, "src", "validator.ts"), `
export function validateEmail(email: string): boolean {
  // Validates email format using regex pattern matching
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

export function validatePassword(password: string): boolean {
  // Validates password strength requirements
  return password.length >= 8;
}
    `.trim());
    
    // Test file
    writeFileSync(join(testDir, "src", "validator.test.ts"), `
import { describe, test, expect } from "bun:test";
import { validateEmail, validatePassword } from "./validator";

describe("validateEmail", () => {
  test("validates correct email format", () => {
    expect(validateEmail("test@example.com")).toBe(true);
  });
  
  test("rejects invalid email format", () => {
    expect(validateEmail("not-an-email")).toBe(false);
  });
});

describe("validatePassword", () => {
  test("validates password length requirement", () => {
    expect(validatePassword("12345678")).toBe(true);
    expect(validatePassword("short")).toBe(false);
  });
});
    `.trim());
    
    // Documentation
    writeFileSync(join(testDir, "docs", "validation.md"), `
# Validation Module

## Email Validation

The \`validateEmail\` function checks if an email address is valid.
It uses regex pattern matching to verify the email format.

## Password Validation

The \`validatePassword\` function ensures passwords meet security requirements.
Minimum length is 8 characters.
    `.trim());
    
    // README at root
    writeFileSync(join(testDir, "README.md"), `
# Validation Library

A simple validation library for email and password validation.
Uses regex pattern matching for email format checking.
    `.trim());
    
    const result = await indexProject(ctx, testDir);
    projectId = result.projectId;
  }, 60000);

  afterEach(() => {
    setTestEmbedder(null);
    ctx.cleanup();
    unloadModel();
    
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("focus:code should rank production code above test files", async () => {
    const response = await searchCode(
      "email validation regex pattern", 
      projectId,
      { limit: 5, focus: "code" }
    );
    
    expect(response.results.length).toBeGreaterThan(0);
    
    // The first result should be production code, not test file
    const firstResult = response.results[0]!;
    expect(firstResult.filePath).not.toContain(".test.");
    expect(firstResult.filePath).not.toContain(".spec.");
    
    // validator.ts should be ranked higher than validator.test.ts
    const codeIndex = response.results.findIndex(r => 
      r.filePath.includes("validator.ts") && !r.filePath.includes(".test.")
    );
    const testIndex = response.results.findIndex(r => 
      r.filePath.includes("validator.test.ts")
    );
    
    if (codeIndex !== -1 && testIndex !== -1) {
      expect(codeIndex).toBeLessThan(testIndex);
    }
  }, 30000);

  test("focus:code should rank code above docs", async () => {
    const response = await searchCode(
      "validation module email password", 
      projectId,
      { limit: 5, focus: "code" }
    );
    
    expect(response.results.length).toBeGreaterThan(0);
    
    // First result should NOT be markdown
    const firstResult = response.results[0]!;
    expect(firstResult.filePath).not.toMatch(/\.md$/);
    
    // Code files should come before markdown files
    const codeResults = response.results.filter(r => !r.filePath.endsWith(".md"));
    const docResults = response.results.filter(r => r.filePath.endsWith(".md"));
    
    if (codeResults.length > 0 && docResults.length > 0) {
      const firstCodeIndex = response.results.indexOf(codeResults[0]!);
      const firstDocIndex = response.results.indexOf(docResults[0]!);
      expect(firstCodeIndex).toBeLessThan(firstDocIndex);
    }
  }, 30000);

  test("focus:tests should rank test files above production code", async () => {
    const response = await searchCode(
      "validateEmail test expect toBe", 
      projectId,
      { limit: 5, focus: "tests" }
    );
    
    expect(response.results.length).toBeGreaterThan(0);
    
    // First result should be a test file
    const firstResult = response.results[0]!;
    expect(
      firstResult.filePath.includes(".test.") || 
      firstResult.filePath.includes(".spec.") ||
      firstResult.filePath.includes("/tests/") ||
      firstResult.filePath.includes("/__tests__/")
    ).toBe(true);
  }, 30000);

  test("focus:docs should rank markdown above code", async () => {
    const response = await searchCode(
      "validation module documentation", 
      projectId,
      { limit: 5, focus: "docs" }
    );
    
    expect(response.results.length).toBeGreaterThan(0);
    
    // First result should be documentation
    const firstResult = response.results[0]!;
    expect(firstResult.filePath).toMatch(/\.(md|txt|rst)$/);
  }, 30000);

  test("focus:code should produce different results than focus:tests", async () => {
    const codeResponse = await searchCode(
      "validate password requirements", 
      projectId,
      { limit: 5, focus: "code" }
    );
    const testsResponse = await searchCode(
      "validate password requirements", 
      projectId,
      { limit: 5, focus: "tests" }
    );
    
    expect(codeResponse.results.length).toBeGreaterThan(0);
    expect(testsResponse.results.length).toBeGreaterThan(0);
    
    // The first results should be different
    // focus:code should have production code first
    // focus:tests should have test file first
    const codeFirstPath = codeResponse.results[0]?.filePath ?? "";
    const testsFirstPath = testsResponse.results[0]?.filePath ?? "";
    
    // They should NOT be identical (the bug we're fixing)
    expect(codeFirstPath).not.toBe(testsFirstPath);
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
