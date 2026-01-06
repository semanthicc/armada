import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import type { Part, UserMessage } from '@opencode-ai/sdk';
import { tool } from '@opencode-ai/plugin';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { basename } from 'path';

// Core module imports
import {
  loadConfig,
  findBestMatch,
  findAllMatches,
  findByName,
  expandVariables,
  isOrGroup,
  shortId,
  showToast,
  log,
  clearLog,
} from './core';
import type { VariableResolver, CaptainConfig, TagEntry, PluginEvent } from './core';

import {
  loadScrolls,
  loadOrders,
  detectScrollMentions,
  detectOrderMentions,
  extractOrderReferences,
  formatAutoApplyHint,
  formatSuggestion,
  highlightMatchedWords,
  sanitizeUserMessage,
  processMessageText,
  expandOrderMentions,
  findMatchingAutoScrolls,
  findMatchingAutoOrders,
  findSpawnScrolls,
  findSpawnOrders,
} from './scrolls';
import type { Scroll, ScrollRef, Order, OrderRef, AutomentionMode, ScrollInScrollMode } from './scrolls';

// Rules module imports
import {
  loadRules,
  processRulesForAgent,
} from './rules';
import type { Rule } from './rules';

// Captain Tool imports
import { discoverToolsForWorkflow, createCaptainTool } from './captain-tool';

// Crew module imports
import {
  loadCrews,
  registerCrewsWithConfig,
} from './crew';
import type { Crew } from './crew';

// Type aliases for backward compatibility in this file
type Workflow = Order;
type WorkflowRef = OrderRef;
type WorkflowConfig = CaptainConfig;

const sessionWorkflows = new Map<string, Map<string, WorkflowRef>>();
const processedAutoApply = new Set<string>();
const sessionSpawnedAgents = new Map<string, Set<string>>();

const ONLOAD_TIMEOUT_MS = 5000;

async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}






const DISTINCTION_RULE = `
<system-rule>
**DISTINCTION RULE**:
- **Managing Resources (Workflows/Rules/Crews)**:
  - **STEP 1**: Fetch \`//captain-manager\` (via \`fetch_scroll("captain-manager")\`) to get management tools.
  - **STEP 2**: Use \`captain_tool(...)\` for robust management (create/edit/read/delete).
  - **CLI Option**: \`captain <cmd> <type> <name>\` is available for simple tasks (list/delete).
  - **CRITICAL**: The \`.opencode/scrolls\` directory is MANAGED. NEVER use \`read\`, \`write\`, \`edit\`, or \`glob\` on workflow files directly. ALWAYS use \`captain_tool\` or CLI.
- **Skills**: Markdown-defined capabilities (e.g., \`skills_brand_guidelines\`). Call via \`skill\` tool or \`skills_*\` dynamic tools (if present).
- **Workflows/Scrolls**: Inline templates triggered by \`//name\` (e.g., \`//commit_review\`). Do NOT call them; just mention them.

**WORKFLOW XML HANDLING** (READ THIS, IT'S IMPORTANT):
1. **\`<workflow name="X">\` IN MESSAGE**: The content is RIGHT THERE. Read it. Follow it. Execute it. Do NOT call \`fetch_scroll\` — that's stupid, the content is already in front of you.
2. **\`[use_workflow:X-id]\` WITHOUT XML**: Orphan reference. Use \`fetch_scroll\` to retrieve it.
3. **\`[⚡ Workflow matched...]\` HINT**: System detected relevant workflows wrapped in brackets. FOR EACH, ask yourself:
   - "Does this workflow's description match what the user actually wants?"
   - "If I DON'T fetch this, will the user wonder why I ignored their relevant workflow?"
   - If yes → call \`fetch_scroll("name")\` and apply it. No asking. No suggesting. Just do it.
   - If no → Skip silently.
   - If unsure → Fetch (bias toward action).
   - Time limit: 3 seconds per decision. Don't overthink.
4. **\`[Suggested workflows: //X]\` HINT**: Show this suggestion to the user. Do NOT auto-apply. Let user decide.
5. **User explicitly runs \`//workflow\`**: If the workflow content is NOT already in the conversation history, use \`fetch_scroll\` to fetch fresh context before executing.

**WHEN MULTIPLE WORKFLOWS MATCH**:
1. Is there ONE obvious match? → Fetch only that one
2. Are there TWO complementary matches? → Fetch both
3. Are there THREE+ matches? → Fetch top 2 by relevance, mention others
4. Are ALL matches weak? → Mention to user, don't auto-fetch

**ANTI-PATTERN — DO NOT DO THIS**:
User: "validate the changes"
Hint: [⚡ Workflow matched... //inspect]
Assistant: *runs tests manually without calling fetch_scroll("inspect")*
THIS IS WRONG. The workflow EXISTS for this purpose. USE IT.

**CREATING WORKFLOWS**: When user asks to create a workflow, use the \`captain_tool\` system. NEVER manually create .md files.
</system-rule>
`;



function buildWorkflowSystemPrompt(workflows: Map<string, Workflow>, activeAgent?: string): string {
  const parts: string[] = [DISTINCTION_RULE];

  const catalogEntries = [...workflows.values()]
    .filter(w => w.automention !== 'false')
    .filter(w => w.onlyFor.length === 0 || (activeAgent && w.onlyFor.includes(activeAgent)))
    .filter((w, idx, arr) => arr.findIndex(x => x.name === w.name) === idx)
    .map(w => {
      const tagsStr = w.tags.length > 0 ? ` [${w.tags.join(', ')}]` : '';
      const aliasStr = w.aliases.length > 0 ? ` (aliases: ${w.aliases.join(', ')})` : '';
      const modeStr = w.automention === 'expanded' ? ' {auto-expand}' : '';
      return `//${w.name}${aliasStr}: ${w.description || 'No description'}${tagsStr}${modeStr}`;
    });

  if (catalogEntries.length > 0) {
    parts.push(
      `\n<workflow-catalog description="Available auto-workflows with their descriptions. Use these to decide relevance.">\n${catalogEntries.join('\n')}\n</workflow-catalog>\n\n` +
      `<auto-workflow-behavior>\n` +
      `When you see [Auto-apply workflows: //X — "description" — if relevant, use fetch_scroll("name") to fetch and apply]:\n` +
      `1. The description is RIGHT THERE in the hint — read it\n` +
      `2. If description matches user's intent → call fetch_scroll("X") and APPLY it\n` +
      `3. No asking permission. No "would you like me to...". Just fetch and execute.\n` +
      `4. If description does NOT match intent → ignore, proceed normally\n` +
      `\n` +
      `When you see [Suggested workflows: //X — "description"]:\n` +
      `- These are {user-decides} workflows. Show the suggestion to the user, do NOT auto-apply.\n` +
      `</auto-workflow-behavior>`
    );
  }

  return parts.join('\n');
}

export const WorkflowsPlugin: Plugin = async (ctx: PluginInput) => {
  const { directory } = ctx;
  let workflows = loadOrders(directory);
  let rules = loadRules(directory);
  let crews = loadCrews(directory);
  let config = loadConfig();

  const contextVariables: Record<string, VariableResolver> = {
    PROJECT: () => basename(directory),
    BRANCH: () => {
      try {
        return execSync('git branch --show-current', { cwd: directory, encoding: 'utf-8' }).trim();
      } catch {
        return 'unknown';
      }
    },
    USER: () => process.env.USER || process.env.USERNAME || 'unknown',
  };

  return {
    // PRIMARY: chat.params hook - appends to systemPrompt like opencode-elf
    "chat.params": async (params: Record<string, unknown>) => {
      try {
        workflows = loadOrders(directory);
        rules = loadRules(directory);
        
        const input = params.input as Record<string, unknown> | undefined;
        if (!input) return;

        const activeAgent = input.agent as string | undefined;
        const workflowSystemContent = buildWorkflowSystemPrompt(workflows, activeAgent);
        const rulesContent = processRulesForAgent(rules, activeAgent);
        
        const existingSystemPrompt = input.systemPrompt as string | undefined;
        if (existingSystemPrompt?.includes("DISTINCTION RULE")) return;

        let newSystemPrompt = existingSystemPrompt || '';
        newSystemPrompt += workflowSystemContent;
        newSystemPrompt += rulesContent;
        
        input.systemPrompt = newSystemPrompt;
      } catch (error) {
        console.error("Workflows: Error in chat.params hook", error);
      }
    },

    // Register crews as agents in the config
    config: async (config: { agent?: Record<string, unknown> }) => {
      crews = loadCrews(directory);
      const captainConfig = loadConfig();
      config.agent = registerCrewsWithConfig(crews, config.agent, captainConfig);
    },

    // FALLBACK: experimental.chat.system.transform for older OpenCode versions
    "experimental.chat.system.transform": async (
      input: { agent?: string },
      output: { system: string[] }
    ) => {
      const hasRule = output.system.some(s => s.includes("DISTINCTION RULE"));
      if (hasRule) return;

      const hasCatalog = output.system.some(s => s.includes("<workflow-catalog"));
      if (hasCatalog) return;

      const activeAgent = input.agent;
      const catalogEntries = [...workflows.values()]
        .filter(w => w.automention !== 'false')
        .filter(w => w.onlyFor.length === 0 || (activeAgent && w.onlyFor.includes(activeAgent)))
        .filter((w, idx, arr) => arr.findIndex(x => x.name === w.name) === idx)
        .map(w => {
          const tagsStr = w.tags.length > 0 ? ` [${w.tags.join(', ')}]` : '';
          const aliasStr = w.aliases.length > 0 ? ` (aliases: ${w.aliases.join(', ')})` : '';
          const modeStr = w.automention === 'expanded' ? ' {auto-expand}' : '';
          return `//${w.name}${aliasStr}: ${w.description || 'No description'}${tagsStr}${modeStr}`;
        });

      if (catalogEntries.length > 0) {
        output.system.push(
          `<workflow-catalog description="Available auto-workflows with their descriptions. Use these to decide relevance.">\n${catalogEntries.join('\n')}\n</workflow-catalog>\n\n` +
          `<auto-workflow-behavior>\n` +
          `When you see [Auto-apply workflows: //X — "description" — if relevant, use fetch_scroll("name") to fetch and apply]:\n` +
          `1. The description is RIGHT THERE in the hint — read it\n` +
          `2. If description matches user's intent → call fetch_scroll("X") and APPLY it\n` +
          `3. No asking permission. No "would you like me to...". Just fetch and execute.\n` +
          `4. If description does NOT match intent → ignore, proceed normally\n` +
          `\n` +
          `When you see [Suggested workflows: //X — "description"]:\n` +
          `- These are {user-decides} workflows. Show the suggestion to the user, do NOT auto-apply.\n` +
          `</auto-workflow-behavior>`
        );
      }
    },

    // Transform user message parts to expand //workflow mentions
    "chat.message": async (
      _input: {
        sessionID: string;
        agent?: string;
        model?: { providerID: string; modelID: string };
        messageID?: string;
      },
      output: {
        message: UserMessage;
        parts: Part[];
      }
    ) => {
      try {
        workflows = loadOrders(directory);
        config = loadConfig();
        const sessionID = _input.sessionID;
        const messageID = output.message.id;
        const activeAgent = _input.agent;

        if (!sessionWorkflows.has(sessionID)) {
          sessionWorkflows.set(sessionID, new Map());
        }
        const workflowRefs = sessionWorkflows.get(sessionID)!;

        if (!sessionSpawnedAgents.has(sessionID)) {
          sessionSpawnedAgents.set(sessionID, new Set());
        }
        const spawnedAgents = sessionSpawnedAgents.get(sessionID)!;
        
        const isAgentFirstMessage = activeAgent && !spawnedAgents.has(activeAgent);
        if (activeAgent && isAgentFirstMessage) {
          spawnedAgents.add(activeAgent);
          
          const spawnResult = findSpawnOrders([...workflows.values()], activeAgent);
          
          if (spawnResult.expanded.length > 0 || spawnResult.hints.length > 0) {
            const lastTextPart = output.parts.filter(p => p.type === "text").pop() as { type: "text"; text: string } | undefined;
            if (lastTextPart) {
              for (const wfName of spawnResult.expanded) {
                const wf = workflows.get(wfName);
                if (wf) {
                  const id = shortId(messageID, wfName, []);
                  const expandedContent = expandVariables(wf.content, contextVariables);
                  lastTextPart.text += `\n\n<workflow name="${wfName}" id="${wfName}-${id}" source="${wf.source}" trigger="agentSpawn">\n${expandedContent}\n</workflow>\n`;
                }
              }
              
              if (spawnResult.hints.length > 0) {
                lastTextPart.text += `\n\n${formatAutoApplyHint(spawnResult.hints, workflows, new Map())}`;
              }
            }
          }
        }

        // Global scan: Check ALL parts for mentions first.
        // If the user mentioned a workflow ANYWHERE in this message, we should NOT be offering auto-apply hints.
        const hasGlobalMentions = output.parts.some(
          (p: { type: string; text?: string }) =>
            p.type === "text" && p.text && detectOrderMentions(p.text).length > 0
        );

        const textParts = output.parts.filter(p => p.type === "text" && "text" in p);
        const lastTextPart = textParts[textParts.length - 1];

        for (const part of output.parts) {
          if (part.type === "text" && "text" in part) {
            const textPart = part as { type: "text"; text: string };
            const mentions = detectOrderMentions(textPart.text);

            // Only run auto-apply logic if there are NO mentions in the ENTIRE message, not just this part.
            // AND only for the last text part to avoid duplicate hints.
            if (mentions.length === 0 && !hasGlobalMentions && part === lastTextPart) {
              if (processedAutoApply.has(messageID)) continue;
              
              const activeAgent = _input.agent;
              const cleanText = sanitizeUserMessage(textPart.text);
              textPart.text = cleanText;
              
              const alreadyReferenced = extractOrderReferences(cleanText);

              const { autoApply, expandedApply, matchedKeywords } = findMatchingAutoOrders(
                cleanText,
                [...workflows.values()],
                activeAgent,
                alreadyReferenced
              );

              log('logHighlight', 'autoApply:', autoApply, 'expandedApply:', expandedApply);
              log('logHighlight', 'matchedKeywords:', [...matchedKeywords.entries()]);

              const allKeywords = [...matchedKeywords.values()].flat();
              log('logHighlight', 'allKeywords:', allKeywords);
              log('logHighlight', 'textPart.text BEFORE highlight:', textPart.text);
              
              if (allKeywords.length > 0) {
                textPart.text = highlightMatchedWords(textPart.text, allKeywords);
                log('logHighlight', 'textPart.text AFTER highlight:', textPart.text);
              }

              if (autoApply.length > 0) {
                textPart.text += `\n\n${formatAutoApplyHint(autoApply, workflows, matchedKeywords)}`;
                processedAutoApply.add(messageID);
              }
              
              if (expandedApply.length > 0) {
                for (const wfName of expandedApply) {
                  const wf = workflows.get(wfName);
                  if (wf) {
                    const id = shortId(messageID, wfName, []);
                    const expandedContent = expandVariables(wf.content, contextVariables);
                    textPart.text += `\n\n<workflow name="${wfName}" id="${wfName}-${id}" source="${wf.source}">\n${expandedContent}\n</workflow>\n`;
                  }
                }
                processedAutoApply.add(messageID);
              }
              continue;
            }

                        // Use the pure engine logic to process the text
            const engineResult = processMessageText(
              textPart.text,
              workflows,
              workflowRefs,
              messageID,
              contextVariables,
              config
            );

            // Update state with new references returned by engine
            for (const [name, ref] of engineResult.newRefs) {
              workflowRefs.set(name, ref);
            }
            
            if (engineResult.found.length === 0 && engineResult.reused.length === 0 && engineResult.notFound.length === 0) continue;

            textPart.text = engineResult.text;

            // Display warnings
            if (engineResult.warnings.length > 0) {
              showToast(ctx, engineResult.warnings.join('\n'), 'warning', 'Workflow Nesting');
            }

            const toastParts: string[] = [];
            let toastVariant: "success" | "info" | "warning" = "success";

            if (engineResult.found.length > 0) {
              toastParts.push(`✓ Expanded: ${engineResult.found.join(', ')}`);
            }
            if (engineResult.reused.length > 0) {
              toastParts.push(`↺ Referenced: ${engineResult.reused.join(', ')}`);
              if (toastVariant === "success" && engineResult.found.length === 0) toastVariant = "info";
            }
            if (engineResult.notFound.length > 0) {
              toastVariant = "warning";
              const suggestionMsg = [...engineResult.suggestions.entries()]
                .map(([typo, matches]) => {
                  const formatted = matches.map(match => {
                    const wf = workflows.get(match);
                    return wf ? formatSuggestion(wf.name, wf.aliases) : match;
                  }).join(' | ');
                  return `${typo} → ${formatted}`;
                })
                .join(', ');
              
              if (suggestionMsg) {
                toastParts.push(`? Did you mean: ${suggestionMsg}`);
              } else {
                toastParts.push(`✗ Not found: ${engineResult.notFound.join(', ')}`);
              }
            }

            if (toastParts.length > 0) {
              showToast(ctx, toastParts.join('\n'), toastVariant, "Workflows");
            }
          }
        }
      } catch (error) {
        showToast(ctx, String(error), "error", "Workflows Error");
      }
    },

    event: async ({ event }: { event: PluginEvent }) => {
      if (event.type === 'session.created') {
        workflows = loadOrders(directory);
        config = loadConfig();
      }
      if (event.type === 'session.deleted' && event.properties?.sessionID) {
        sessionWorkflows.delete(event.properties.sessionID);
        sessionSpawnedAgents.delete(event.properties.sessionID);
      }
      if (event.type === 'message.removed' && event.properties?.sessionID && event.properties?.messageID) {
        const workflowRefs = sessionWorkflows.get(event.properties.sessionID);
        if (workflowRefs) {
          const removedMessageID = event.properties.messageID;
          for (const [name, ref] of workflowRefs.entries()) {
            if (ref.messageID === removedMessageID) {
              workflowRefs.delete(name);
            }
          }
        }
      }
    },

    tool: {
      list_workflows: tool({
        description: 'List all available workflow templates that can be mentioned with //workflow-name syntax',
        args: {
          tag: tool.schema.string().describe('Filter by tag (substring match)').optional(),
          name: tool.schema.string().describe('Filter by name (substring match)').optional(),
          folder: tool.schema.string().describe('Filter by folder (substring match)').optional(),
          scope: tool.schema.enum(['global', 'project']).describe('Filter by scope').optional(),
        },
        async execute(args) {
          workflows = loadOrders(directory);

          if (workflows.size === 0) {
            return 'No workflows available.\n\nCreate .md files in:\n- ~/.config/opencode/workflows/ (global)\n- .opencode/workflows/ (project-specific)';
          }

          let filtered = [...workflows.values()]
            .filter((w, i, arr) => arr.findIndex(x => x.name === w.name) === i);
          
          if (args.scope) {
            filtered = filtered.filter(w => w.source === args.scope);
          }
          if (args.folder) {
            const folderLower = args.folder.toLowerCase();
            filtered = filtered.filter(w => w.folder?.toLowerCase().includes(folderLower));
          }
          if (args.name) {
            const nameLower = args.name.toLowerCase();
            filtered = filtered.filter(w => w.name.toLowerCase().includes(nameLower));
          }
          if (args.tag) {
            const tagLower = args.tag.toLowerCase();
            filtered = filtered.filter(w => 
              w.tags.some(t => {
                if (typeof t === 'string') return t.toLowerCase().includes(tagLower);
                if (Array.isArray(t)) return t.some(item => typeof item === 'string' && item.toLowerCase().includes(tagLower));
                return false;
              })
            );
          }

          if (filtered.length === 0) {
            return `No workflows match the filters.\n\nFilters applied: ${JSON.stringify(args)}`;
          }

          const list = filtered
            .map((w) => {
              const aliasStr = w.aliases.length > 0 ? ` (aliases: ${w.aliases.join(', ')})` : '';
              const folderStr = w.folder ? ` [${w.folder}/]` : '';
              return `- //${w.name}${aliasStr}${folderStr} [${w.source}]: ${w.description || w.content.slice(0, 80).replace(/\n/g, ' ').trim()}...`;
            })
            .join('\n');

          return `Available workflows (${filtered.length}):\n\n${list}\n\nUsage: Add //workflow-name anywhere in your message to apply that workflow.`;
        },
      }),

      fetch_scroll: tool({
        description: 'Fetch the full content of a scroll (workflow template) by name. If scroll has on_load tools defined, they execute automatically and results are embedded.',
        args: {
          name: tool.schema
            .string()
            .describe('The scroll name (without the // prefix), e.g., "linus-torvalds"'),
        },
        async execute(args) {
          workflows = loadOrders(directory);

          const workflow = workflows.get(args.name);
          if (!workflow) {
            const available = [...workflows.keys()];
            const availableStr = available.length > 0 ? available.map((a) => `//${a}`).join(', ') : 'none';
            return `Scroll "${args.name}" not found.\n\nAvailable: ${availableStr}\n\nHint: Create .md files in ~/.config/opencode/scrolls/ or .opencode/scrolls/`;
          }

          const folderInfo = workflow.folder ? `\nFolder: ${workflow.folder}` : '';
          
          const tools = discoverToolsForWorkflow(directory, workflow.name);
          let toolsSection = '';
          if (tools.length > 0) {
            const toolLines = tools.map((t) => `- \`captain_tool("${t.path}", {...})\` — ${t.name}`);
            toolsSection = `\n\n## Available Tools\n${toolLines.join('\n')}`;
          }

          let onLoadSection = '';
          const onLoadTools = workflow.onLoad || [];
          if (onLoadTools.length > 0) {
            const captainTool = createCaptainTool(directory);
            const results: Array<{ tool: string; result: string; error?: boolean }> = [];
            
            for (const toolPath of onLoadTools) {
              try {
                const result = await executeWithTimeout(
                  () => captainTool.execute({ tool: toolPath, params: {} }),
                  ONLOAD_TIMEOUT_MS
                );
                results.push({
                  tool: toolPath,
                  result: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                });
              } catch (err) {
                results.push({
                  tool: toolPath,
                  result: `⚠️ Failed: ${err instanceof Error ? err.message : String(err)}`,
                  error: true,
                });
              }
            }

            if (results.length > 0) {
              const resultLines = results.map((r) => 
                `### ${r.tool}${r.error ? ' (failed)' : ''}\n\`\`\`\n${r.result}\n\`\`\``
              );
              onLoadSection = `\n\n## On-Load Results (auto-executed)\n${resultLines.join('\n\n')}`;
            }
          }
          
          return `# Scroll: //${workflow.name}\nSource: ${workflow.source}${folderInfo}\nPath: ${workflow.path}\n\n${workflow.content}${toolsSection}${onLoadSection}`;
        },
      }),

      get_workflow: tool({
        description: '[DEPRECATED: Use fetch_scroll] Get the full content of a specific workflow template by name',
        args: {
          name: tool.schema
            .string()
            .describe('The workflow name (without the // prefix), e.g., "linus-torvalds"'),
        },
        async execute(args) {
          workflows = loadOrders(directory);

          const workflow = workflows.get(args.name);
          if (!workflow) {
            const available = [...workflows.keys()];
            const availableStr = available.length > 0 ? available.map((a) => `//${a}`).join(', ') : 'none';
            return `Workflow "${args.name}" not found.\n\nAvailable: ${availableStr}\n\nHint: Create .md files in ~/.config/opencode/workflows/ or .opencode/workflows/`;
          }

          const folderInfo = workflow.folder ? `\nFolder: ${workflow.folder}` : '';
          
          const tools = discoverToolsForWorkflow(directory, workflow.name);
          let toolsSection = '';
          if (tools.length > 0) {
            const toolLines = tools.map((t) => `- \`captain_tool("${t.path}", {...})\` — ${t.name}`);
            toolsSection = `\n\n## Available Tools\n${toolLines.join('\n')}`;
          }

          let onLoadSection = '';
          const onLoadTools = workflow.onLoad || [];
          if (onLoadTools.length > 0) {
            const captainTool = createCaptainTool(directory);
            const results: Array<{ tool: string; result: string; error?: boolean }> = [];
            
            for (const toolPath of onLoadTools) {
              try {
                const result = await executeWithTimeout(
                  () => captainTool.execute({ tool: toolPath, params: {} }),
                  ONLOAD_TIMEOUT_MS
                );
                results.push({
                  tool: toolPath,
                  result: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                });
              } catch (err) {
                results.push({
                  tool: toolPath,
                  result: `⚠️ Failed: ${err instanceof Error ? err.message : String(err)}`,
                  error: true,
                });
              }
            }

            if (results.length > 0) {
              const resultLines = results.map((r) => 
                `### ${r.tool}${r.error ? ' (failed)' : ''}\n\`\`\`\n${r.result}\n\`\`\``
              );
              onLoadSection = `\n\n## On-Load Results (auto-executed)\n${resultLines.join('\n\n')}`;
            }
          }
          
          return `# Workflow: //${workflow.name}\nSource: ${workflow.source}${folderInfo}\nPath: ${workflow.path}\n\n${workflow.content}${toolsSection}${onLoadSection}`;
        },
      }),

      captain_tool: (() => {
        const captainTool = createCaptainTool(directory);
        return tool({
          description: captainTool.description,
          args: {
            tool: tool.schema.string().describe("Tool path: 'category/tool' or 'category/workflow/tool'"),
            params: tool.schema.object({}).passthrough().optional().describe('Parameters to pass to the tool'),
          },
          async execute(args) {
            const result = await captainTool.execute({ tool: args.tool, params: args.params ?? {} });
            return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          },
        });
      })(),
    },
  };
};

export default WorkflowsPlugin;
