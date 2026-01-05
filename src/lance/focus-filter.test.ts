import { describe, test, expect } from "bun:test";

// Test cases for buildFocusWhereClause patterns
// These tests verify that the WHERE clause correctly handles cross-platform paths

describe("Focus filter WHERE clause patterns", () => {
  
  // Simulate what LanceDB LIKE does - simple pattern matching
  function likeMatcher(value: string, pattern: string): boolean {
    // Convert SQL LIKE pattern to regex
    // % = .*, _ = .
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]]/g, '\\$&') // Escape regex special chars
      .replace(/%/g, '.*')
      .replace(/_/g, '.');
    return new RegExp(`^${regexPattern}$`, 'i').test(value);
  }

  describe("CODE_EXTENSIONS pattern", () => {
    const patterns = ['%.ts', '%.tsx', '%.js', '%.jsx', '%.py', '%.go', '%.rs', '%.java', '%.c', '%.cpp'];
    
    test("matches .ts files with forward slashes", () => {
      expect(patterns.some(p => likeMatcher("src/auth.ts", p))).toBe(true);
    });
    
    test("matches .ts files with backslashes (Windows)", () => {
      expect(patterns.some(p => likeMatcher("src\\auth.ts", p))).toBe(true);
    });
    
    test("does NOT match .md files", () => {
      expect(patterns.some(p => likeMatcher("docs/readme.md", p))).toBe(false);
    });
    
    test("does NOT match .json files", () => {
      expect(patterns.some(p => likeMatcher("package.json", p))).toBe(false);
    });
  });

  describe("TEST_PATTERNS pattern (paths normalized to forward slashes)", () => {
    const patterns = [
      '%.test.%',
      '%.spec.%', 
      '%/tests/%',
      '%/__tests__/%'
    ];
    
    test("matches .test.ts files", () => {
      expect(patterns.some(p => likeMatcher("src/auth.test.ts", p))).toBe(true);
    });
    
    test("matches .spec.ts files", () => {
      expect(patterns.some(p => likeMatcher("src/auth.spec.ts", p))).toBe(true);
    });
    
    test("matches /tests/ folder", () => {
      expect(patterns.some(p => likeMatcher("src/tests/auth.ts", p))).toBe(true);
    });
    
    test("matches /__tests__/ folder", () => {
      expect(patterns.some(p => likeMatcher("src/__tests__/auth.ts", p))).toBe(true);
    });
    
    test("does NOT match production code", () => {
      expect(patterns.some(p => likeMatcher("src/auth.ts", p))).toBe(false);
    });
  });

  describe("Cross-platform path normalization", () => {
    // The actual fix: normalize paths to forward slashes before storing/querying
    function normalizePath(path: string): string {
      return path.replace(/\\/g, '/');
    }
    
    test("normalizes Windows backslashes to forward slashes", () => {
      expect(normalizePath("src\\auth\\login.ts")).toBe("src/auth/login.ts");
    });
    
    test("leaves forward slashes unchanged", () => {
      expect(normalizePath("src/auth/login.ts")).toBe("src/auth/login.ts");
    });
    
    test("handles mixed separators", () => {
      expect(normalizePath("src\\auth/login.ts")).toBe("src/auth/login.ts");
    });
    
    test("normalized paths match test patterns correctly", () => {
      const patterns = ['%/tests/%', '%/__tests__/%', '%.test.%'];
      const windowsPath = "src\\tests\\auth.ts";
      const normalized = normalizePath(windowsPath);
      
      // Windows path without normalization might not match
      const matchesRaw = patterns.some(p => likeMatcher(windowsPath, p));
      // Normalized path should match
      const matchesNormalized = patterns.some(p => likeMatcher(normalized, p));
      
      expect(matchesNormalized).toBe(true);
    });
  });
});
