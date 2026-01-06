import { describe, test, expect } from "bun:test";
import { shouldCaptureError, PASSIVE_CONFIG } from "./passive-learner";

describe("Passive Filtering: shouldCaptureError", () => {
  describe("Transient network errors (ignored)", () => {
    test("ECONNRESET", () => {
      expect(shouldCaptureError("Error: read ECONNRESET at TCP.onStreamRead")).toBe(false);
    });

    test("ETIMEDOUT", () => {
      expect(shouldCaptureError("Error: connect ETIMEDOUT 192.168.1.1:443")).toBe(false);
    });

    test("ECONNREFUSED", () => {
      expect(shouldCaptureError("Error: connect ECONNREFUSED 127.0.0.1:3000")).toBe(false);
    });

    test("socket hang up", () => {
      expect(shouldCaptureError("Error: socket hang up during request")).toBe(false);
    });

    test("network timeout", () => {
      expect(shouldCaptureError("Request failed: network timeout after 30s")).toBe(false);
    });

    test("connection reset", () => {
      expect(shouldCaptureError("Connection reset by peer while fetching")).toBe(false);
    });

    test("EPIPE", () => {
      expect(shouldCaptureError("Error: write EPIPE at WriteWrap")).toBe(false);
    });
  });

  describe("False positive patterns (ignored)", () => {
    test("error handling", () => {
      expect(shouldCaptureError("Added error handling to the function")).toBe(false);
    });

    test("fixed the error", () => {
      expect(shouldCaptureError("I fixed the error in the code")).toBe(false);
    });

    test("no errors", () => {
      expect(shouldCaptureError("Build completed with no errors found")).toBe(false);
    });

    test("no error (singular)", () => {
      expect(shouldCaptureError("Validation passed, no error detected")).toBe(false);
    });

    test("resolved the issue", () => {
      expect(shouldCaptureError("Successfully resolved the issue with auth")).toBe(false);
    });

    test("successfully", () => {
      expect(shouldCaptureError("File was successfully written to disk")).toBe(false);
    });
  });

  describe("Content length filtering", () => {
    test("too short content ignored", () => {
      expect(shouldCaptureError("Error: fail")).toBe(false);
    });

    test("minimum length content captured", () => {
      const content = "TypeError: Cannot read property 'x'";
      expect(content.length).toBeGreaterThanOrEqual(PASSIVE_CONFIG.MIN_CONTENT_LENGTH);
      expect(shouldCaptureError(content)).toBe(true);
    });
  });

  describe("Real errors (captured)", () => {
    test("TypeError", () => {
      expect(shouldCaptureError("TypeError: Cannot read property 'map' of undefined")).toBe(true);
    });

    test("ENOENT file not found", () => {
      expect(shouldCaptureError("Error: ENOENT: no such file or directory, open '/path/to/file'")).toBe(true);
    });

    test("SyntaxError", () => {
      expect(shouldCaptureError("SyntaxError: Unexpected token } in JSON at position 42")).toBe(true);
    });

    test("Permission denied (not transient)", () => {
      expect(shouldCaptureError("Error: EACCES: permission denied, open '/root/secret'")).toBe(true);
    });

    test("Module not found", () => {
      expect(shouldCaptureError("Error: Cannot find module '@foo/bar' from 'src/index.ts'")).toBe(true);
    });

    test("Database error", () => {
      expect(shouldCaptureError("SQLiteError: table users has no column named email")).toBe(true);
    });
  });
});
