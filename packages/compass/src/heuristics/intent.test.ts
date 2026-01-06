import { describe, test, expect } from "bun:test";
import { detectHistoryIntent } from "./intent";

describe("detectHistoryIntent", () => {
  const positives = [
    "Why is it like this?",
    "Why was this decision made?",
    "Show me the history of this pattern",
    "How did this evolve?",
    "What was the previous approach?",
    "We used to do X, what changed?",
    "This evolved from an older pattern",
    "What was superseded?",
    "Show older versions",
    "What was before this decision?",
    "Why does it work this way?",
    "How did we change from REST to GraphQL?",
    "The original implementation was different",
  ];

  const negatives = [
    "Show me all patterns",
    "What patterns do we have?",
    "Add a new rule",
    "List memories for testing",
    "Search for authentication",
    "What is the current approach?",
    "How should I implement this?",
    "Best practices for TypeScript",
    "Index this project",
  ];

  test.each(positives)('detects history intent in: "%s"', (text) => {
    expect(detectHistoryIntent(text)).toBe(true);
  });

  test.each(negatives)('does not detect history intent in: "%s"', (text) => {
    expect(detectHistoryIntent(text)).toBe(false);
  });

  test("accuracy check: should detect at least 90% of positives", () => {
    const detected = positives.filter((t) => detectHistoryIntent(t)).length;
    const accuracy = detected / positives.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });

  test("false positive check: should reject at least 90% of negatives", () => {
    const rejected = negatives.filter((t) => !detectHistoryIntent(t)).length;
    const accuracy = rejected / negatives.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });
});
