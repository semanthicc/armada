import { getCurrentProject, registerProject } from "./hooks/project-detect";
import { getHeuristicsContext } from "./hooks/heuristics-injector";
import { addMemory, deleteMemory, listMemories } from "./heuristics";
import { indexProject, getIndexStats } from "./indexer";
import { searchCode, formatSearchResultsForTool } from "./search";

export const name = "semanthicc";

export type * from "./types";
export * from "./heuristics";
export * from "./hooks/project-detect";
export * from "./hooks/heuristics-injector";
export * from "./embeddings";
export * from "./indexer";
export * from "./search";

interface PluginContext {
  directory: string;
}

interface SystemTransformInput {
  messages: unknown[];
}

interface SystemTransformOutput {
  system: string[];
}

type Plugin = (context: PluginContext) => Promise<PluginDefinition>;

interface PluginDefinition {
  name: string;
  "experimental.chat.system.transform"?: (
    input: SystemTransformInput,
    output: SystemTransformOutput
  ) => Promise<void>;
  tool?: Record<string, unknown>;
}

interface ToolParams {
  action: "search" | "index" | "status" | "remember" | "forget" | "list";
  query?: string;
  type?: string;
  domain?: string;
  global?: boolean;
  id?: number;
  limit?: number;
}

const semanthiccPlugin: Plugin = async ({ directory }) => {
  return {
    name: "semanthicc",

    "experimental.chat.system.transform": async (_input, output) => {
      const project = getCurrentProject(directory);
      const heuristicsContext = getHeuristicsContext(project?.id ?? null);

      if (heuristicsContext) {
        output.system.push(heuristicsContext);
      }
    },

    tool: {
      semanthicc: {
        name: "semanthicc",
        description: "Semantic code search and memory management",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["search", "index", "status", "remember", "forget", "list"],
              description: "Action: search code, index project, check status, or manage heuristics",
            },
            query: {
              type: "string",
              description: "Search query or content to remember",
            },
            type: {
              type: "string",
              enum: ["pattern", "decision", "constraint", "learning", "context"],
              description: "Type of memory (for 'remember' action)",
            },
            domain: {
              type: "string",
              description: "Domain tag (e.g., 'typescript', 'testing')",
            },
            global: {
              type: "boolean",
              description: "Make this a global memory (applies to all projects)",
            },
            id: {
              type: "number",
              description: "Memory ID (for 'forget' action)",
            },
            limit: {
              type: "number",
              description: "Max results (for 'search' and 'list' actions)",
            },
          },
          required: ["action"],
        },
        execute: async (params: ToolParams) => {
          const { action, query, type, domain, global, id, limit = 5 } = params;
          const project = getCurrentProject(directory);

          switch (action) {
            case "search": {
              if (!query) {
                return { error: "Query is required for search" };
              }
              if (!project) {
                return { error: "No project found. Run 'index' first." };
              }
              const stats = getIndexStats(project.id);
              if (stats.chunkCount === 0) {
                return { error: "Project not indexed. Run 'index' first." };
              }
              const results = await searchCode(query, project.id, limit);
              return { 
                results: formatSearchResultsForTool(results),
                count: results.length,
              };
            }

            case "index": {
              const result = await indexProject(directory, {
                projectName: directory.split(/[/\\]/).pop(),
              });
              return {
                success: true,
                filesIndexed: result.filesIndexed,
                chunksCreated: result.chunksCreated,
                durationMs: result.durationMs,
              };
            }

            case "status": {
              if (!project) {
                return { indexed: false, message: "Project not registered" };
              }
              const stats = getIndexStats(project.id);
              return {
                indexed: stats.chunkCount > 0,
                projectId: project.id,
                projectPath: project.path,
                chunkCount: stats.chunkCount,
                fileCount: stats.fileCount,
                staleCount: stats.staleCount,
                lastIndexedAt: stats.lastIndexedAt,
              };
            }

            case "remember": {
              if (!query) {
                return { error: "Content is required for remember" };
              }
              const memory = addMemory({
                content: query,
                concept_type: (type as "pattern" | "decision" | "constraint" | "learning" | "context") ?? "pattern",
                domain,
                project_id: global ? null : project?.id ?? null,
              });
              return { success: true, id: memory.id };
            }

            case "forget": {
              if (!id) {
                return { error: "Memory ID is required for forget" };
              }
              const deleted = deleteMemory(id);
              return { success: deleted };
            }

            case "list": {
              const memories = listMemories({
                projectId: project?.id ?? null,
                domain,
                limit,
              });
              return {
                memories: memories.map(m => ({
                  id: m.id,
                  type: m.concept_type,
                  content: m.content,
                  confidence: m.effectiveConfidence.toFixed(2),
                  domain: m.domain,
                  isGlobal: m.project_id === null,
                })),
              };
            }

            default:
              return { error: `Unknown action: ${action}` };
          }
        },
      },
    },
  };
};

export default semanthiccPlugin;
