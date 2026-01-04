import { describe, test, expect } from "bun:test";
import { detectDomains } from "./heuristics-injector";

describe("detectDomains", () => {
  describe("Frontend frameworks", () => {
    test("detects .svelte", () => {
      expect(detectDomains("Fix the Button.svelte component")).toContain("svelte");
    });

    test("detects .vue", () => {
      expect(detectDomains("Update App.vue")).toContain("vue");
    });

    test("detects .tsx as react", () => {
      expect(detectDomains("Edit UserList.tsx")).toContain("react");
    });

    test("detects .jsx as react", () => {
      expect(detectDomains("Fix Header.jsx")).toContain("react");
    });
  });

  describe("Languages", () => {
    test("detects .ts as typescript", () => {
      expect(detectDomains("Check utils.ts")).toContain("typescript");
    });

    test("detects .js as javascript", () => {
      expect(detectDomains("Run index.js")).toContain("javascript");
    });

    test("detects .py as python", () => {
      expect(detectDomains("Fix main.py")).toContain("python");
    });

    test("detects .go as golang", () => {
      expect(detectDomains("Update server.go")).toContain("golang");
    });

    test("detects .rs as rust", () => {
      expect(detectDomains("Check lib.rs")).toContain("rust");
    });
  });

  describe("Multiple extensions", () => {
    test("detects multiple domains from one message", () => {
      const domains = detectDomains("Update App.svelte and utils.ts");
      expect(domains).toContain("svelte");
      expect(domains).toContain("typescript");
    });

    test("deduplicates same domain", () => {
      const domains = detectDomains("Fix Button.tsx and Header.tsx");
      expect(domains).toEqual(["react"]);
    });

    test("handles mixed frameworks and languages", () => {
      const domains = detectDomains("Check App.vue, utils.py, and server.go");
      expect(domains).toContain("vue");
      expect(domains).toContain("python");
      expect(domains).toContain("golang");
      expect(domains).toHaveLength(3);
    });
  });

  describe("Edge cases", () => {
    test("returns empty array for no extensions", () => {
      expect(detectDomains("Help me with this code")).toEqual([]);
    });

    test("ignores unknown extensions", () => {
      expect(detectDomains("Check file.xyz")).toEqual([]);
    });

    test("handles case insensitivity", () => {
      expect(detectDomains("Fix App.SVELTE")).toContain("svelte");
      expect(detectDomains("Check utils.TS")).toContain("typescript");
    });

    test("handles paths with extensions", () => {
      expect(detectDomains("Edit src/components/Button.svelte")).toContain("svelte");
    });

    test("handles multiple dots in filename", () => {
      expect(detectDomains("Fix app.config.ts")).toContain("typescript");
    });
  });

  describe("Styles", () => {
    test("detects .css", () => {
      expect(detectDomains("Update styles.css")).toContain("css");
    });

    test("detects .scss", () => {
      expect(detectDomains("Fix main.scss")).toContain("scss");
    });
  });

  describe("Config/Data", () => {
    test("detects .sql", () => {
      expect(detectDomains("Run migration.sql")).toContain("sql");
    });

    test("detects .graphql", () => {
      expect(detectDomains("Update schema.graphql")).toContain("graphql");
    });
  });
});
