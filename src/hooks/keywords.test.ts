import { describe, test, expect } from "bun:test";
import { extractKeywords, getDomainFromTool } from "./keywords";

describe("extractKeywords", () => {
  test("extracts lowercase tokens", () => {
    const text = "Error: File Not Found in /src/app";
    const keywords = extractKeywords(text);
    expect(keywords).toContain("file");
    expect(keywords).toContain("found");
    expect(keywords).toContain("src");
    expect(keywords).toContain("app");
  });

  test("filters stopwords", () => {
    const text = "The quick brown fox jumps over the lazy dog";
    const keywords = extractKeywords(text);
    expect(keywords).not.toContain("the");
    expect(keywords).not.toContain("over");
    expect(keywords).toContain("quick");
    expect(keywords).toContain("brown");
  });

  test("filters short tokens", () => {
    const text = "a ab abc abcd";
    const keywords = extractKeywords(text);
    expect(keywords).not.toContain("a");
    expect(keywords).not.toContain("ab");
    expect(keywords).toContain("abc");
    expect(keywords).toContain("abcd");
  });

  test("filters generic error terms", () => {
    const text = "Validation failed with unexpected exception";
    const keywords = extractKeywords(text);
    expect(keywords).not.toContain("failed");
    expect(keywords).not.toContain("exception");
    expect(keywords).toContain("validation");
    expect(keywords).toContain("unexpected");
  });
});

describe("getDomainFromTool", () => {
  test("maps known tools", () => {
    expect(getDomainFromTool("bash")).toBe("bash");
    expect(getDomainFromTool("read")).toBe("file-read");
    expect(getDomainFromTool("edit")).toBe("file-edit");
  });

  test("heuristically maps git tools", () => {
    expect(getDomainFromTool("git_commit")).toBe("git");
    expect(getDomainFromTool("git_status")).toBe("git");
  });

  test("heuristically maps lsp tools", () => {
    expect(getDomainFromTool("lsp_hover")).toBe("lsp");
    expect(getDomainFromTool("lsp_references")).toBe("lsp");
  });

  test("returns unknown for unmapped tools", () => {
    expect(getDomainFromTool("random_tool_123")).toBe("unknown");
  });
});
