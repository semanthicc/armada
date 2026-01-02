import { getCurrentProject } from "./hooks/project-detect";
import { getHeuristicsContext } from "./hooks/heuristics-injector";

export const name = "semanthicc";

export type * from "./types";
export * from "./heuristics";
export * from "./hooks/project-detect";
export * from "./hooks/heuristics-injector";

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
        description: "Semantic code search and memory management (MVP-2)",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["search", "remember", "forget", "list"],
              description: "Action to perform",
            },
            query: {
              type: "string",
              description: "Search query or content to remember",
            },
          },
          required: ["action"],
        },
        execute: async () => {
          return { error: "Semantic search not yet implemented (MVP-2)" };
        },
      },
    },
  };
};

export default semanthiccPlugin;
