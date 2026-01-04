import { getDb } from "../db";
import type { SemanthiccContext } from "../context";
import { listMemories, HEURISTICS } from "../heuristics";
import { findSimilarFailures } from "./similarity";
import { extractKeywords } from "./keywords";
import type { MemoryWithEffectiveConfidence, Memory } from "../types";
import { INJECTABLE_CONCEPT_TYPES } from "../constants";

function getLegacyContext(): SemanthiccContext {
  return { db: getDb() };
}

export function formatHeuristicsForInjection(
  memories: MemoryWithEffectiveConfidence[],
  warnings: Memory[] = []
): string {
  if (memories.length === 0 && warnings.length === 0) return "";

  const lines = memories.map((m) => {
    const scope = m.project_id === null ? "[global] " : "";
    const golden = m.is_golden ? "⭐ " : "";
    const conf = m.effectiveConfidence.toFixed(2);
    return `- ${golden}${scope}[${conf}] ${m.content}`;
  });

  let output = "";

  if (lines.length > 0) {
    output += `<project-heuristics>
## Learned Patterns (confidence-ranked)
${lines.join("\n")}
</project-heuristics>`;
  }

  if (warnings.length > 0) {
    const warningLines = warnings.map((m) => `- ${m.content}`);
    const warningBlock = `
<failure-warnings>
## ⚠️ Relevant Past Failures
(These similar issues occurred previously - consider them!)
${warningLines.join("\n")}
</failure-warnings>`;
    output += warningBlock;
  }

  return output;
}

export function getHeuristicsContext(
  ctxOrProjectId: SemanthiccContext | number | null,
  projectIdOrQuery?: number | null | string,
  userQuery?: string
): string {
  let ctx: SemanthiccContext;
  let projectId: number | null;
  let query: string | undefined;

  if (ctxOrProjectId === null || typeof ctxOrProjectId === "number") {
    ctx = getLegacyContext();
    projectId = ctxOrProjectId;
    query = projectIdOrQuery as string | undefined;
  } else {
    ctx = ctxOrProjectId;
    projectId = projectIdOrQuery as number | null;
    query = userQuery;
  }

  const memories = listMemories(ctx, {
    projectId,
    conceptTypes: INJECTABLE_CONCEPT_TYPES,
    includeGlobal: true,
    limit: HEURISTICS.MAX_INJECTION_COUNT,
  });

  let warnings: Memory[] = [];
  if (query) {
    const keywords = extractKeywords(query);
    warnings = findSimilarFailures(ctx, keywords, projectId);
  }

  return formatHeuristicsForInjection(memories, warnings);
}
