import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import type { Part, UserMessage } from '@opencode-ai/sdk';
import { tool } from '@opencode-ai/plugin';
import { loadConfig, loadWorkflows, getWorkflowPath, saveWorkflow, deleteWorkflow, renameWorkflowFile, workflowExists } from './storage';
import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, renameSync } from 'fs';
import { execSync } from 'child_process';
import { join, basename } from 'path';
import { homedir } from 'os';
import { 
  findBestMatch, 
  findAllMatches, 
  findWorkflowByName, 
  detectWorkflowMentions, 
  parseFrontmatter, 
  formatSuggestion, 
  expandVariables, 
  isOrGroup,
  extractWorkflowReferences,
  formatAutoApplyHint, 
  formatUserHint,
  shortId,
  processMessageText,
  expandWorkflowMentions,
  findMatchingAutoWorkflows
} from './engine';
import type { VariableResolver, AutoworkflowMode, WorkflowInWorkflowMode, TagEntry } from './engine';
import type { Workflow, WorkflowConfig, WorkflowRef } from './types';

// WorkflowInfo is now Workflow from types.ts
// WorkflowConfig is now imported from types.ts

interface PluginEvent {
  type: string;
  properties?: {
    sessionID?: string;
    messageID?: string;
    [key: string]: unknown;
  };
}

// loadConfig, loadWorkflows, getWorkflowPath are now imported from storage.ts

const sessionWorkflows = new Map<string, Map<string, WorkflowRef>>();
const processedAutoApply = new Set<string>();

// shortId is now imported from engine.ts

// NestedExpansionResult and expandNestedWorkflows are now imported from engine.ts

// expandWorkflowMentions is now imported from engine.ts

const DISTINCTION_RULE = `
<system-rule>
**DISTINCTION RULE**:
- **Tools**: Native functions provided by plugins (e.g., \`create_workflow\`, \`rename_workflow\`). Call them directly.
  - **CRITICAL**: The \`workflows\` directory is MANAGED. NEVER use \`read\`, \`write\`, \`edit\`, or \`glob\` on workflow files directly. ALWAYS use the dedicated tools (\`list_workflows\`, \`get_workflow\`, \`edit_workflow\`, \`create_workflow\`).
- **Skills**: Markdown-defined capabilities (e.g., \`skills_brand_guidelines\`). Call via \`skill\` tool or \`skills_*\` dynamic tools (if present).
- **Workflows**: Inline templates triggered by \`//name\` (e.g., \`//commit_review\`). Do NOT call them; just mention them.

**WORKFLOW XML HANDLING** (READ THIS, IT'S IMPORTANT):
1. **\`<workflow name="X">\` IN MESSAGE**: The content is RIGHT THERE. Read it. Follow it. Execute it. Do NOT call \`get_workflow\` — that's stupid, the content is already in front of you.
2. **\`[use_workflow:X-id]\` WITHOUT XML**: Orphan reference. Use \`get_workflow\` to retrieve it.
3. **\`[Auto-apply workflows: //X, //Y]\` HINT**: System detected relevant workflows based on your message. Check the \`<workflow-catalog>\` descriptions. If ANY workflow matches what user actually wants → fetch it with \`get_workflow\` and apply it. No asking. No suggesting. Just do it.
4. **\`[Suggested workflows: //X]\` HINT**: Show this suggestion to the user. Do NOT auto-apply. Let user decide.
5. **User explicitly runs \`//workflow\`**: If the workflow content is NOT already in the conversation history, use \`get_workflow\` to fetch fresh context before executing.

**CREATING WORKFLOWS**: When user asks to create a workflow, use the \`create_workflow\` tool. NEVER manually create .md files.
</system-rule>
`;

async function showToast(
  ctx: PluginInput,
  message: string,
  variant: "info" | "success" | "warning" | "error" = "info",
  title?: string,
  duration = 3000
) {
  try {
    await ctx.client.tui.publish({
      body: {
        type: "tui.toast.show",
        properties: { title, message, variant, duration }
      }
    });
  } catch {}
}

export const WorkflowsPlugin: Plugin = async (ctx: PluginInput) => {
  const { directory } = ctx;
  let workflows = loadWorkflows(directory);
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
    "experimental.chat.system.transform": async (
      input: { agent?: string },
      output: { system: string[] }
    ) => {
      const hasRule = output.system.some(s => s.includes("DISTINCTION RULE"));
      if (!hasRule) {
        output.system.push(DISTINCTION_RULE);
      }

      const hasCatalog = output.system.some(s => s.includes("<workflow-catalog"));
      if (hasCatalog) return;

      const activeAgent = input.agent;
      const catalogEntries = [...workflows.values()]
        .filter(w => w.autoworkflow === 'true' || w.autoworkflow === 'hintForUser')
        .filter(w => w.agents.length === 0 || (activeAgent && w.agents.includes(activeAgent)))
        .filter((w, idx, arr) => arr.findIndex(x => x.name === w.name) === idx)
        .map(w => {
          const tagsStr = w.tags.length > 0 ? ` [${w.tags.join(', ')}]` : '';
          const aliasStr = w.aliases.length > 0 ? ` (aliases: ${w.aliases.join(', ')})` : '';
          const modeStr = w.autoworkflow === 'hintForUser' ? ' {user-decides}' : '';
          return `//${w.name}${aliasStr}: ${w.description || 'No description'}${tagsStr}${modeStr}`;
        });

      if (catalogEntries.length > 0) {
        output.system.push(
          `<workflow-catalog description="Available auto-workflows with their descriptions. Use these to decide relevance.">\n${catalogEntries.join('\n')}\n</workflow-catalog>\n\n` +
          `<auto-workflow-behavior>\n` +
          `When you see [Auto-apply workflows: //X — "description" — if relevant, use get_workflow("name") to fetch and apply]:\n` +
          `1. The description is RIGHT THERE in the hint — read it\n` +
          `2. If description matches user's intent → call get_workflow("X") and APPLY it\n` +
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
        workflows = loadWorkflows(directory);
        config = loadConfig();
        const sessionID = _input.sessionID;
        const messageID = output.message.id;

        if (!sessionWorkflows.has(sessionID)) {
          sessionWorkflows.set(sessionID, new Map());
        }
        const workflowRefs = sessionWorkflows.get(sessionID)!;

        // Global scan: Check ALL parts for mentions first.
        // If the user mentioned a workflow ANYWHERE in this message, we should NOT be offering auto-apply hints.
        const hasGlobalMentions = output.parts.some(
          (p: { type: string; text?: string }) =>
            p.type === "text" && p.text && detectWorkflowMentions(p.text).length > 0
        );

        const textParts = output.parts.filter(p => p.type === "text" && "text" in p);
        const lastTextPart = textParts[textParts.length - 1];

        for (const part of output.parts) {
          if (part.type === "text" && "text" in part) {
            const textPart = part as { type: "text"; text: string };
            const mentions = detectWorkflowMentions(textPart.text);

            // Only run auto-apply logic if there are NO mentions in the ENTIRE message, not just this part.
            // AND only for the last text part to avoid duplicate hints.
            if (mentions.length === 0 && !hasGlobalMentions && part === lastTextPart) {
              if (processedAutoApply.has(messageID)) continue;
              
              const activeAgent = _input.agent;
              const alreadyReferenced = extractWorkflowReferences(textPart.text);

              const { autoApply, userHints } = findMatchingAutoWorkflows(
                textPart.text,
                [...workflows.values()],
                activeAgent,
                alreadyReferenced
              );

              if (autoApply.length > 0) {
                const descriptions = new Map(autoApply.map(name => {
                  const w = workflows.get(name);
                  return [name, w?.description || 'No description'] as [string, string];
                }));
                textPart.text += `\n\n${formatAutoApplyHint(autoApply, descriptions)}`;
                processedAutoApply.add(messageID);
              }
              if (userHints.length > 0) {
                const descriptions = new Map(userHints.map(name => {
                  const w = workflows.get(name);
                  return [name, w?.description || 'No description'] as [string, string];
                }));
                textPart.text += `\n\n${formatUserHint(userHints, descriptions)}`;
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
        workflows = loadWorkflows(directory);
        config = loadConfig();
      }
      if (event.type === 'session.deleted' && event.properties?.sessionID) {
        sessionWorkflows.delete(event.properties.sessionID);
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
      expand_workflows: tool({
        description: `Expand //workflow-name mentions in text. Useful for manually expanding workflow references. Returns the expanded text with workflow content injected.`,
        args: {
          text: tool.schema
            .string()
            .describe('The text containing //workflow mentions to expand'),
        },
        async execute(args) {
          workflows = loadWorkflows(directory);
          config = loadConfig();
          const { expanded, found, notFound } = expandWorkflowMentions(args.text, workflows, config);

          if (found.length === 0 && notFound.length === 0) {
            return `No //workflow mentions detected in text.\n\nOriginal: ${args.text}`;
          }

          const notFoundMsg = notFound.length > 0 ? `\nUnknown workflows: ${notFound.join(', ')}` : '';
          return `Expanded ${found.length} workflow(s): ${found.join(', ')}${notFoundMsg}\n\n${expanded}`;
        },
      }),

      list_workflows: tool({
        description: 'List all available workflow templates that can be mentioned with //workflow-name syntax',
        args: {},
        async execute() {
          workflows = loadWorkflows(directory);

          if (workflows.size === 0) {
            return 'No workflows available.\n\nCreate .md files in:\n- ~/.config/opencode/workflows/ (global)\n- .opencode/workflows/ (project-specific)';
          }

          const list = [...workflows.values()]
            .filter((w, i, arr) => arr.findIndex(x => x.name === w.name) === i)
            .map((w) => {
              const aliasStr = w.aliases.length > 0 ? ` (aliases: ${w.aliases.join(', ')})` : '';
              return `- //${w.name}${aliasStr} [${w.source}]: ${w.description || w.content.slice(0, 80).replace(/\n/g, ' ').trim()}...`;
            })
            .join('\n');

          return `Available workflows (${workflows.size}):\n\n${list}\n\nUsage: Add //workflow-name anywhere in your message to apply that workflow.`;
        },
      }),

      get_workflow: tool({
        description: 'Get the full content of a specific workflow template by name',
        args: {
          name: tool.schema
            .string()
            .describe('The workflow name (without the // prefix), e.g., "linus-torvalds"'),
        },
        async execute(args) {
          workflows = loadWorkflows(directory);

          const workflow = workflows.get(args.name);
          if (!workflow) {
            const available = [...workflows.keys()];
            const availableStr = available.length > 0 ? available.map((a) => `//${a}`).join(', ') : 'none';
            return `Workflow "${args.name}" not found.\n\nAvailable: ${availableStr}\n\nHint: Create .md files in ~/.config/opencode/workflows/ or .opencode/workflows/`;
          }

          return `# Workflow: //${workflow.name}\nSource: ${workflow.source}\nPath: ${workflow.path}\n\n${workflow.content}`;
        },
      }),

      create_workflow: tool({
        description: 'Create a new workflow template with YAML frontmatter. ASK user: 1) global or project scope? 2) shortcuts/aliases? 3) description? 4) tags for auto-suggestion? 5) autoworkflow mode (true/hintForUser/false)?',
        args: {
          name: tool.schema.string().describe('The workflow name (without // prefix)'),
          content: tool.schema.string().describe('The markdown content of the workflow (without frontmatter - it will be added automatically)'),
          scope: tool.schema.enum(['global', 'project']).describe('Where to save: global (~/.config/opencode/workflows/) or project (.opencode/workflows/)').optional(),
          shortcuts: tool.schema.string().describe('Comma-separated shortcuts/aliases, e.g., "cr, review"').optional(),
          description: tool.schema.string().describe('Short description of what the workflow does').optional(),
          tags: tool.schema.string().describe('Tags for auto-suggestion. Use comma for singles, brackets for groups that must ALL match. E.g., "commit, [staged, changes], review" - groups like [staged,changes] trigger when ALL words present, singles need 2+ matches').optional(),
          autoworkflow: tool.schema.enum(['true', 'hintForUser', 'false']).describe('Auto-suggestion mode: true (AI applies), hintForUser (user decides), false (no suggestion). Default: false').optional(),
        },
        async execute(args) {
          const scope = args.scope || 'global';
          const filePath = getWorkflowPath(args.name, scope, directory);

          if (existsSync(filePath)) {
            return `Error: Workflow "${args.name}" already exists in ${scope} scope. Use edit_workflow to modify it.`;
          }

          const shortcutArray = args.shortcuts 
            ? args.shortcuts.split(',').map(a => a.trim()).filter(a => a)
            : [];
          const tagArray = args.tags
            ? args.tags.split(',').map(t => t.trim()).filter(t => t)
            : [];
          
          const autoVal = args.autoworkflow || 'false';
          
          let frontmatter = '---\n';
          if (args.description) frontmatter += `description: "${args.description}"\n`;
          if (shortcutArray.length > 0) frontmatter += `shortcuts: [${shortcutArray.join(', ')}]\n`;
          if (tagArray.length > 0) frontmatter += `tags: [${tagArray.join(', ')}]\n`;
          frontmatter += `autoworkflow: ${autoVal}\n`;
          frontmatter += '---\n';
          
          const fullContent = frontmatter + args.content;

          writeFileSync(filePath, fullContent, 'utf-8');
          workflows = loadWorkflows(directory);
          
          const shortcutMsg = shortcutArray.length > 0 
            ? `\nShortcuts: ${shortcutArray.map(a => `//${a}`).join(', ')}`
            : '';
          const tagMsg = tagArray.length > 0 ? `\nTags: ${tagArray.join(', ')}` : '';
          const autoMsg = `\nAutoworkflow: ${autoVal}`;
          return `Workflow "//${args.name}" created in ${scope} scope.\nPath: ${filePath}${shortcutMsg}${tagMsg}${autoMsg}`;
        },
      }),

      edit_workflow: tool({
        description: 'Edit an existing workflow template. To add/modify shortcuts, include them in the YAML frontmatter (shortcuts: or aliases:).',
        args: {
          name: tool.schema.string().describe('The workflow name'),
          content: tool.schema.string().describe('The new markdown content (including frontmatter if you want aliases)'),
          scope: tool.schema.enum(['global', 'project']).describe('Scope of the workflow').optional(),
          createIfMissing: tool.schema.boolean().describe('Create if it does not exist').optional(),
        },
        async execute(args) {
          const scope = args.scope || 'global';
          const filePath = getWorkflowPath(args.name, scope, directory);

          if (!existsSync(filePath) && !args.createIfMissing) {
            return `Error: Workflow "${args.name}" not found in ${scope} scope. Set createIfMissing=true to create it.`;
          }

          writeFileSync(filePath, args.content, 'utf-8');
          workflows = loadWorkflows(directory);
          return `Workflow "//${args.name}" updated successfully.`;
        },
      }),

      delete_workflow: tool({
        description: 'Delete a workflow template',
        args: {
          name: tool.schema.string().describe('The workflow name'),
          scope: tool.schema.enum(['global', 'project']).describe('Scope of the workflow').optional(),
        },
        async execute(args) {
          const scope = args.scope || 'global';
          const filePath = getWorkflowPath(args.name, scope, directory);

          if (!existsSync(filePath)) {
            return `Error: Workflow "${args.name}" not found in ${scope} scope.`;
          }

          unlinkSync(filePath);
          workflows = loadWorkflows(directory);
          return `Workflow "//${args.name}" deleted successfully.`;
        },
      }),

      rename_workflow: tool({
        description: 'Rename an existing workflow template',
        args: {
          oldName: tool.schema.string().describe('The current workflow name'),
          newName: tool.schema.string().describe('The new workflow name'),
          scope: tool.schema.enum(['global', 'project']).describe('Scope of the workflow').optional(),
        },
        async execute(args) {
          const scope = args.scope || 'global';
          const oldPath = getWorkflowPath(args.oldName, scope, directory);
          const newPath = getWorkflowPath(args.newName, scope, directory);

          if (!existsSync(oldPath)) {
            return `Error: Workflow "${args.oldName}" not found in ${scope} scope.`;
          }

          if (existsSync(newPath)) {
            return `Error: Workflow "${args.newName}" already exists in ${scope} scope. Delete it first if you want to overwrite.`;
          }

          renameSync(oldPath, newPath);
          workflows = loadWorkflows(directory);
          return `Workflow renamed from "//${args.oldName}" to "//${args.newName}" successfully.`;
        },
      }),

      reload_workflows: tool({
        description: 'Reload all workflow templates from disk (useful after creating new ones)',
        args: {},
        async execute() {
          const oldCount = workflows.size;
          workflows = loadWorkflows(directory);
          config = loadConfig();
          const newCount = workflows.size;

          const workflowList = [...workflows.keys()].map((w) => `//${w}`).join(', ') || 'none';
          return `Workflows reloaded.\n\nPrevious: ${oldCount}\nCurrent: ${newCount}\nAvailable: ${workflowList}`;
        },
      }),
    },
  };
};

export default WorkflowsPlugin;
