import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { getOrCreateProject } from "./hooks/auto-register";
import { getHeuristicsContext } from "./hooks/heuristics-injector";
import { createPassiveLearner } from "./hooks/passive-learner";
import { isToolError } from "./hooks/error-detect";
import { addMemory, deleteMemory, listMemories, supersedeMemory, archiveMemory, promoteMemory, demoteMemory } from "./heuristics";
import { exportMemories, importMemories } from "./heuristics/transfer";
import { detectHistoryIntent } from "./heuristics/intent";
import { indexProject, getIndexStats } from "./indexer";
import { searchCode, formatSearchResultsForTool } from "./search";
import { getStatus, formatStatus } from "./status";
import { readFileSync, writeFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";

export type * from "./types";

export const SemanthiccPlugin: Plugin = async (ctx: PluginInput) => {
  const { directory } = ctx;
  const project = getOrCreateProject(directory);
  
  const sessionLearners = new Map<string, ReturnType<typeof createPassiveLearner>>();
  
  function getLearner(sessionID: string) {
    let learner = sessionLearners.get(sessionID);
    if (!learner) {
      learner = createPassiveLearner(project?.id ?? null, sessionID);
      sessionLearners.set(sessionID, learner);
    }
    return learner;
  }

  return {
    name: "semanthicc",

    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: unknown }
    ) => {
      try {
        if (!output) return;
        
        const isError = isToolError(output.output, output.title);
        const learner = getLearner(input.sessionID);
        
        learner.handleToolOutcome(
          { tool: { name: input.tool, parameters: {} } },
          { content: output.output, isError }
        );
      } catch (error) {
        console.error("Semanthicc: Error in tool.execute.after hook", error);
      }
    },

    "chat.params": async (params: Record<string, unknown>) => {
      try {
        const input = params.input as Record<string, unknown> | undefined;
        if (!input) return;

        let userQuery: string | undefined;
        if (Array.isArray(input.messages)) {
          const lastMsg = input.messages[input.messages.length - 1];
          if (lastMsg && typeof lastMsg === 'object' && lastMsg.role === 'user' && typeof lastMsg.content === 'string') {
            userQuery = lastMsg.content;
          }
        }

        const project = getOrCreateProject(directory);
        const heuristicsContext = getHeuristicsContext(project?.id ?? null, userQuery);

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
        description: "Semantic code search and memory management. Actions: search, index, status, remember, forget, list, supersede, failure-fixed, promote, demote, import, export",
        args: {
          action: tool.schema
            .enum(["search", "index", "status", "remember", "forget", "list", "supersede", "failure-fixed", "promote", "demote", "import", "export"])
            .describe("Action to perform"),
          query: tool.schema
            .string()
            .describe("Search query, content to remember, or file path for import/export")
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
            .describe("Memory ID (for forget/promote/demote actions)")
            .optional(),
          limit: tool.schema
            .number()
            .describe("Max results (default 5)")
            .optional(),
          includeHistory: tool.schema
            .boolean()
            .describe("Include superseded memories in list results")
            .optional(),
          force: tool.schema
            .boolean()
            .describe("Force action (e.g. promote without domain)")
            .optional(),
        },
        async execute(args) {
          const { action, query, type, domain, global: isGlobal, id, limit = 5, includeHistory, force } = args;
          const project = getOrCreateProject(directory);

          switch (action) {
            case "search": {
              if (!query) {
                return "Error: Query is required for search";
              }
              if (!project) {
                return "Error: Not in a git repository. Run 'index' action from within a git project.";
              }
              const stats = await getIndexStats(project.id);
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
              const status = getStatus(project?.id ?? null);
              return formatStatus(status);
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
              const shouldIncludeHistory = includeHistory || (query ? detectHistoryIntent(query) : false);
              const memories = listMemories({
                projectId: project?.id ?? null,
                domain,
                limit,
                includeHistory: shouldIncludeHistory,
              });
              if (memories.length === 0) {
                return shouldIncludeHistory ? "No memories found (including history)." : "No memories found.";
              }
              const header = shouldIncludeHistory ? "[Including history]\n" : "";
              return header + memories
                .map((m) => {
                  const scope = m.project_id === null ? "[global]" : "";
                  const golden = m.is_golden ? "⭐" : "";
                  const status = m.status !== "current" ? `[${m.status}]` : "";
                  return `${golden}${scope}${status} [${m.effectiveConfidence.toFixed(2)}] ${m.concept_type}: ${m.content}`;
                })
                .join("\n");
            }

            case "supersede": {
              if (!id) {
                return "Error: Memory ID (id) is required for supersede";
              }
              if (!query) {
                return "Error: New content (query) is required for supersede";
              }
              const result = supersedeMemory(id, query);
              if (!result) {
                return `Error: Memory ${id} not found or already superseded`;
              }
              return `Superseded memory ${id} with new memory ${result.new.id}.\nOld: ${result.old.content}\nNew: ${result.new.content}`;
            }

            case "promote": {
              if (!id) {
                return "Error: Memory ID (id) is required for promote";
              }
              try {
                const result = promoteMemory(id, force);
                if (!result) return `Error: Memory ${id} not found`;
                if (result.project_id === null) return `Memory ${id} is already global.`;
                return `Promoted memory ${id} to global scope.`;
              } catch (e) {
                return `Error: ${e instanceof Error ? e.message : String(e)}`;
              }
            }

            case "demote": {
              if (!id) {
                return "Error: Memory ID (id) is required for demote";
              }
              if (!project) {
                return "Error: Not in a project context. Cannot demote to unknown project.";
              }
              const result = demoteMemory(id, project.id);
              if (!result) return `Error: Memory ${id} not found`;
              if (result.project_id === project.id) return `Memory ${id} is already scoped to this project.`;
              return `Demoted memory ${id} to project '${project.name}'.`;
            }

            case "export": {
              const json = exportMemories(project?.id ?? null);
              if (query) {
                const filePath = isAbsolute(query) ? query : join(directory, query);
                writeFileSync(filePath, json);
                return `Exported memories to ${filePath}`;
              }
              return json;
            }

            case "import": {
              if (!query) {
                return "Error: File path or JSON content (query) is required for import";
              }
              let json = query;
              if (query.endsWith(".json") || query.includes("/") || query.includes("\\")) {
                const filePath = isAbsolute(query) ? query : join(directory, query);
                try {
                  json = readFileSync(filePath, "utf-8");
                } catch {
                  // Fallback to treating query as raw JSON
                }
              }
              
              const result = importMemories(project?.id ?? null, json);
              if (result.errors.length > 0) {
                return `Imported ${result.added} memories. Skipped ${result.skipped} duplicates.\nErrors:\n${result.errors.join("\n")}`;
              }
              return `Successfully imported ${result.added} memories. Skipped ${result.skipped} duplicates.`;
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
