import { getDb } from "../db";
import type { SemanthiccContext } from "../context";
import { addMemory, listMemories, archiveMemory } from "../heuristics/repository";
import { extractKeywords, getDomainFromTool } from "./keywords";

function getLegacyContext(): SemanthiccContext {
  return { db: getDb() };
}

export const PASSIVE_CONFIG = {
  MIN_KEYWORDS: 3,
  MAX_CONTENT_LENGTH: 500,
  IGNORED_TOOLS: ["todoread", "todowrite", "task", "think"],
};

export interface ToolExecuteInput {
  tool: { name: string; parameters: Record<string, unknown> };
}

export interface ToolExecuteOutput {
  content: string;
  isError: boolean;
}

export function createPassiveLearner(
  ctxOrProjectId: SemanthiccContext | number | null,
  projectIdOrSessionId: number | null | string,
  sessionId?: string
) {
  let ctx: SemanthiccContext;
  let projectId: number | null;
  let session: string;

  if (typeof ctxOrProjectId === "number" || ctxOrProjectId === null) {
    ctx = getLegacyContext();
    projectId = ctxOrProjectId;
    session = projectIdOrSessionId as string;
  } else {
    ctx = ctxOrProjectId;
    projectId = projectIdOrSessionId as number | null;
    session = sessionId!;
  }

  function handleToolOutcome(input: ToolExecuteInput, output: ToolExecuteOutput): void {
    const { tool } = input;
    
    if (PASSIVE_CONFIG.IGNORED_TOOLS.includes(tool.name)) return;

    if (!output.isError) {
      const pendingFailures = listMemories(ctx, {
        projectId,
        conceptTypes: ["learning"],
        limit: 5,
      });

      const failuresToResolve = pendingFailures.filter(m => 
        m.source === "passive" &&
        m.source_session_id === session &&
        m.source_tool === tool.name &&
        m.status === "current"
      );

      for (const failure of failuresToResolve) {
        archiveMemory(ctx, failure.id);
      }
      return;
    }

    const domain = getDomainFromTool(tool.name);
    const keywords = extractKeywords(output.content);

    if (keywords.length < PASSIVE_CONFIG.MIN_KEYWORDS) return;

    let content = output.content;
    if (content.length > PASSIVE_CONFIG.MAX_CONTENT_LENGTH) {
      content = content.slice(0, PASSIVE_CONFIG.MAX_CONTENT_LENGTH) + "...";
    }

    addMemory(ctx, {
      project_id: projectId,
      concept_type: "learning",
      content: `Tool '${tool.name}' failed: ${content}`,
      domain,
      source: "passive",
      source_session_id: session,
      source_tool: tool.name,
      keywords: JSON.stringify(keywords),
    });
  }

  return {
    handleToolOutcome,
  };
}
