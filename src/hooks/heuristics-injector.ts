import { listMemories, HEURISTICS } from "../heuristics";
import type { MemoryWithEffectiveConfidence } from "../types";

export function formatHeuristicsForInjection(memories: MemoryWithEffectiveConfidence[]): string {
  if (memories.length === 0) return "";

  const lines = memories.map((m) => {
    const scope = m.project_id === null ? "[global] " : "";
    const golden = m.is_golden ? "⭐ " : "";
    const conf = m.effectiveConfidence.toFixed(2);
    return `- ${golden}${scope}[${conf}] ${m.content}`;
  });

  return `<project-heuristics>
## Learned Patterns (confidence-ranked)
${lines.join("\n")}
</project-heuristics>`;
}

export function getHeuristicsContext(projectId: number | null): string {
  const memories = listMemories({
    projectId,
    conceptTypes: ["pattern", "rule", "constraint"],
    includeGlobal: true,
    limit: HEURISTICS.MAX_INJECTION_COUNT,
  });

  return formatHeuristicsForInjection(memories);
}
