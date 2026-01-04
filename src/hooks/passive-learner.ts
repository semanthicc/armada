import { getDb } from "../db";
import type { SemanthiccContext } from "../context";
import { addMemory, listMemories, archiveMemory, DuplicateMemoryError } from "../heuristics/repository";
import { extractKeywords, getDomainFromTool } from "./keywords";

function getLegacyContext(): SemanthiccContext {
  return { db: getDb() };
}

export const PASSIVE_CONFIG = {
  MIN_KEYWORDS: 4,
  MIN_CONTENT_LENGTH: 30,
  MAX_CONTENT_LENGTH: 500,
  IGNORED_TOOLS: ["todoread", "todowrite", "task", "think"],
};

export const TRANSIENT_PATTERNS = [
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ECONNREFUSED/i,
  /socket hang up/i,
  /network timeout/i,
  /connection reset/i,
  /EPIPE/i,
  /EHOSTUNREACH/i,
  /ENETUNREACH/i,
];

export const FALSE_POSITIVE_PATTERNS = [
  /error handling/i,
  /fixed the error/i,
  /no errors?( found)?/i,
  /resolved( the)?( issue)?/i,
  /successfully/i,
];

export function shouldCaptureError(content: string): boolean {
  if (content.length < PASSIVE_CONFIG.MIN_CONTENT_LENGTH) return false;
  
  for (const pattern of TRANSIENT_PATTERNS) {
    if (pattern.test(content)) return false;
  }
  
  for (const pattern of FALSE_POSITIVE_PATTERNS) {
    if (pattern.test(content)) return false;
  }
  
  return true;
}

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

    if (!shouldCaptureError(output.content)) return;

    const domain = getDomainFromTool(tool.name);
    const keywords = extractKeywords(output.content);

    if (keywords.length < PASSIVE_CONFIG.MIN_KEYWORDS) return;

    let content = output.content;
    if (content.length > PASSIVE_CONFIG.MAX_CONTENT_LENGTH) {
      content = content.slice(0, PASSIVE_CONFIG.MAX_CONTENT_LENGTH) + "...";
    }

    try {
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
    } catch (e) {
      if (e instanceof DuplicateMemoryError) return;
      throw e;
    }
  }

  return {
    handleToolOutcome,
  };
}
