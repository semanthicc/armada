import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { getOrCreateProject } from "./hooks/auto-register";
import { getHeuristicsContext } from "./hooks/heuristics-injector";
import { addMemory, deleteMemory, listMemories } from "./heuristics";
import { indexProject, getIndexStats } from "./indexer";
import { searchCode, formatSearchResultsForTool } from "./search";

export type * from "./types";

export const SemanthiccPlugin: Plugin = async (ctx: PluginInput) => {
  const { directory } = ctx;

  return {
    name: "semanthicc",

    "chat.params": async (params: Record<string, unknown>) => {
      try {
        const input = params.input as Record<string, unknown> | undefined;
        if (!input) return;

        const project = getOrCreateProject(directory);
        const heuristicsContext = getHeuristicsContext(project?.id ?? null);

        if (heuristicsContext) {
          const existingSystemPrompt = (input.systemPrompt as string) || "";
          input.systemPrompt = existingSystemPrompt + "\n\n" + heuristicsContext;
        }
      } catch (error) {
        console.error("Semanthicc: Error in chat.params hook", error);
      }
    },

    "experimental.chat.system.transform": async (
      _input: { agent?: string },
      output: { system: string[] }
    ) => {
      try {
        const project = getOrCreateProject(directory);
        const heuristicsContext = getHeuristicsContext(project?.id ?? null);

        if (heuristicsContext && !output.system.some(s => s.includes("<project-heuristics>"))) {
          output.system.push(heuristicsContext);
        }
      } catch (error) {
        console.error("Semanthicc: Error in system.transform hook", error);
      }
    },

    tool: {
      semanthicc: tool({
        description: "Semantic code search and memory management. Actions: search (find code by meaning), index (index project for search), status (check index), remember (add pattern/heuristic), forget (remove memory), list (show memories)",
        args: {
          action: tool.schema
            .enum(["search", "index", "status", "remember", "forget", "list"])
            .describe("Action to perform"),
          query: tool.schema
            .string()
            .describe("Search query or content to remember")
            .optional(),
          type: tool.schema
            .enum(["pattern", "decision", "constraint", "learning", "context", "rule"])
            .describe("Type of memory (for remember action)")
            .optional(),
          domain: tool.schema
            .string()
            .describe("Domain tag (e.g., typescript, testing)")
            .optional(),
          global: tool.schema
            .boolean()
            .describe("Make this a global memory (applies to all projects)")
            .optional(),
          id: tool.schema
            .number()
            .describe("Memory ID (for forget action)")
            .optional(),
          limit: tool.schema
            .number()
            .describe("Max results (default 5)")
            .optional(),
        },
        async execute(args) {
          const { action, query, type, domain, global: isGlobal, id, limit = 5 } = args;
          const project = getOrCreateProject(directory);

          switch (action) {
            case "search": {
              if (!query) {
                return "Error: Query is required for search";
              }
              if (!project) {
                return "Error: Not in a git repository. Run 'index' action from within a git project.";
              }
              const stats = getIndexStats(project.id);
              if (stats.chunkCount === 0) {
                return "Error: Project not indexed. Run 'index' action first.";
              }
              const results = await searchCode(query, project.id, limit);
              return formatSearchResultsForTool(results);
            }

            case "index": {
              const result = await indexProject(directory, {
                projectName: directory.split(/[/\\]/).pop(),
              });
              return `Indexed ${result.filesIndexed} files, created ${result.chunksCreated} chunks in ${result.durationMs}ms`;
            }

            case "status": {
              if (!project) {
                return "Not in a git repository. Git project required for status.";
              }
              const stats = getIndexStats(project.id);
              return `Project: ${project.path}\nIndexed: ${stats.chunkCount > 0 ? "Yes" : "No"}\nChunks: ${stats.chunkCount}\nFiles: ${stats.fileCount}\nStale: ${stats.staleCount}`;
            }

            case "remember": {
              if (!query) {
                return "Error: Content is required for remember";
              }
              const memory = addMemory({
                content: query,
                concept_type: (type as "pattern" | "decision" | "constraint" | "learning" | "context" | "rule") ?? "pattern",
                domain,
                project_id: isGlobal ? null : project?.id ?? null,
              });
              return `Memory saved with ID ${memory.id}. ${isGlobal ? "(global)" : "(project-specific)"}`;
            }

            case "forget": {
              if (!id) {
                return "Error: Memory ID is required for forget";
              }
              const deleted = deleteMemory(id);
              return deleted ? `Memory ${id} deleted.` : `Memory ${id} not found.`;
            }

            case "list": {
              const memories = listMemories({
                projectId: project?.id ?? null,
                domain,
                limit,
              });
              if (memories.length === 0) {
                return "No memories found.";
              }
              return memories
                .map((m) => {
                  const scope = m.project_id === null ? "[global]" : "";
                  const golden = m.is_golden ? "⭐" : "";
                  return `${golden}${scope} [${m.effectiveConfidence.toFixed(2)}] ${m.concept_type}: ${m.content}`;
                })
                .join("\n");
            }

            default:
              return `Error: Unknown action: ${action}`;
          }
        },
      }),
    },
  };
};

export default SemanthiccPlugin;
