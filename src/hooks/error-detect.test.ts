import { describe, test, expect } from "bun:test";
import { isToolError } from "./error-detect";

describe("isToolError", () => {
  test("detects Error: prefix", () => {
    expect(isToolError("Error: File not found")).toBe(true);
    expect(isToolError("error: something went wrong")).toBe(true);
  });

  test("detects 'failed to' patterns", () => {
    expect(isToolError("Failed to read file")).toBe(true);
    expect(isToolError("The operation failed with status 500")).toBe(true);
  });

  test("detects 'not found' patterns", () => {
    expect(isToolError("Module not found: @foo/bar")).toBe(true);
    expect(isToolError("Command not found: git")).toBe(true);
  });

  test("detects permission errors", () => {
    expect(isToolError("Permission denied: /root/secret")).toBe(true);
    expect(isToolError("Access denied to resource")).toBe(true);
  });

  test("detects syntax errors", () => {
    expect(isToolError("SyntaxError: Unexpected token")).toBe(true);
    expect(isToolError("Parse error: unexpected token '}'")).toBe(true);
  });

  test("detects Node.js error codes", () => {
    expect(isToolError("ENOENT: no such file or directory")).toBe(true);
    expect(isToolError("EACCES: permission denied")).toBe(true);
    expect(isToolError("EPERM: operation not permitted")).toBe(true);
  });

  test("detects stack traces", () => {
    expect(isToolError("TypeError: x is not a function\n    at Object.run (foo.js:10:5)")).toBe(true);
  });

  test("detects error in title", () => {
    expect(isToolError("Some output", "Error reading file")).toBe(true);
    expect(isToolError("Some output", "Operation Failed")).toBe(true);
  });

  test("returns false for success output", () => {
    expect(isToolError("File content here...")).toBe(false);
    expect(isToolError("Successfully created file")).toBe(false);
    expect(isToolError("Found 5 matches")).toBe(false);
  });

  test("returns false for empty output", () => {
    expect(isToolError("")).toBe(false);
  });

  test("handles undefined title gracefully", () => {
    expect(isToolError("Normal output", undefined)).toBe(false);
  });
});
