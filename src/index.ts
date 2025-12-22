import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import type { Part, UserMessage } from '@opencode-ai/sdk';
import { tool } from '@opencode-ai/plugin';
import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, renameSync } from 'fs';
import { execSync } from 'child_process';
import { join, basename } from 'path';
import { homedir } from 'os';
import { findBestMatch, findAllMatches, findWorkflowByName, detectWorkflowMentions, parseFrontmatter, formatSuggestion, expandVariables, VariableResolver } from './core';

interface WorkflowInfo {
  name: string;
  aliases: string[];
  tags: string[];
  agents: string[];
  description: string;
  autoworkflow: boolean;
  content: string;
  source: 'project' | 'global';
  path: string;
}

interface WorkflowConfig {
  deduplicateSameMessage: boolean;
}

interface PluginEvent {
  type: string;
  properties?: {
    sessionID?: string;
    messageID?: string;
    [key: string]: unknown;
  };
}

function loadConfig(): WorkflowConfig {
  const configDir = join(homedir(), '.config', 'opencode');
  const configPath = join(configDir, 'workflows.json');
  
  try {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    if (!existsSync(configPath)) {
      const defaultConfig: WorkflowConfig = { deduplicateSameMessage: true };
      writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      return defaultConfig;
    }

    const content = readFileSync(configPath, 'utf-8');
    const json = JSON.parse(content);
    return {
      deduplicateSameMessage: json.deduplicateSameMessage ?? true
    };
  } catch {}
  return { deduplicateSameMessage: true };
}

function getWorkflowDirs(projectDir: string): { path: string; source: 'project' | 'global' }[] {
  const dirs: { path: string; source: 'project' | 'global' }[] = [];

  const projectWorkflows = join(projectDir, '.opencode', 'workflows');
  if (existsSync(projectWorkflows)) {
    dirs.push({ path: projectWorkflows, source: 'project' });
  }

  const globalWorkflows = join(homedir(), '.config', 'opencode', 'workflows');
  if (existsSync(globalWorkflows)) {
    dirs.push({ path: globalWorkflows, source: 'global' });
  }

  return dirs;
}

function getWorkflowPath(name: string, scope: 'project' | 'global', projectDir: string): string {
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeName) throw new Error(`Invalid workflow name: ${name}`);

  let dir: string;
  if (scope === 'project') {
    dir = join(projectDir, '.opencode', 'workflows');
  } else {
    dir = join(homedir(), '.config', 'opencode', 'workflows');
  }

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  return join(dir, `${safeName}.md`);
}

function loadWorkflows(projectDir: string): Map<string, WorkflowInfo> {
  const workflows = new Map<string, WorkflowInfo>();
  const dirs = getWorkflowDirs(projectDir);

  for (const { path: dir, source } of dirs) {
    try {
      const files = readdirSync(dir).filter((f: string) => f.endsWith('.md'));
      for (const file of files) {
        const name = basename(file, '.md');
        if (!workflows.has(name)) {
          const filePath = join(dir, file);
          const rawContent = readFileSync(filePath, 'utf-8');
          const { aliases, tags, agents, description, autoworkflow, body } = parseFrontmatter(rawContent);
          
          const info: WorkflowInfo = { name, aliases, tags, agents, description, autoworkflow, content: body, source, path: filePath };
          workflows.set(name, info);
          
          aliases.forEach(alias => {
            if (!workflows.has(alias)) {
              workflows.set(alias, info);
            }
          });
        }
      }
    } catch {
    }
  }

  return workflows;
}

const sessionWorkflows = new Map<string, Map<string, { id: string; messageID: string }>>();

function shortId(messageID: string): string {
  if (messageID && messageID.length >= 4) {
    return messageID.slice(-4);
  }
  return Math.random().toString(36).slice(2, 6);
}

function expandWorkflowMentions(
  text: string,
  workflows: Map<string, WorkflowInfo>,
  config: WorkflowConfig
): { expanded: string; found: string[]; notFound: string[]; suggestions: Map<string, string> } {
  const mentions = detectWorkflowMentions(text);
  const found: string[] = [];
  const notFound: string[] = [];
  const suggestions = new Map<string, string>();
  let expanded = text;

  for (const { name, force, args } of mentions) {
    const workflow = workflows.get(name);
    if (workflow) {
      found.push(name);
      
      const mentionPatternStr = args && Object.keys(args).length > 0
        ? `(?<![:\\\\w/])//${name}\\([^)]*\\)!?(?![\\\\w-])`
        : `(?<![:\\\\w/])//${name}!?(?![\\\\w-])`;

      const fullContent = `\n\n<workflow name="${name}" source="${workflow.source}">\n${workflow.content}\n</workflow>\n\n`;

      if (config.deduplicateSameMessage) {
        const firstPattern = new RegExp(mentionPatternStr);
        expanded = expanded.replace(firstPattern, fullContent);

        const remainingPattern = new RegExp(mentionPatternStr, 'g');
        expanded = expanded.replace(remainingPattern, `[use_workflow:${name}]`);
      } else {
        const globalPattern = new RegExp(mentionPatternStr, 'g');
        expanded = expanded.replace(globalPattern, fullContent);
      }
    } else {
      notFound.push(name);
      const match = findBestMatch(name, [...workflows.keys()]);
      if (match) {
        suggestions.set(name, match);
      }
    }
  }

  return { expanded, found, notFound, suggestions };
}

const DISTINCTION_RULE = `
<system-rule>
**DISTINCTION RULE**:
- **Tools**: Native functions provided by plugins (e.g., \`create_workflow\`, \`rename_workflow\`). Call them directly.
  - **CRITICAL**: The \`workflows\` directory is MANAGED. NEVER use \`read\`, \`write\`, \`edit\`, or \`glob\` on workflow files directly. ALWAYS use the dedicated tools (\`list_workflows\`, \`get_workflow\`, \`edit_workflow\`).
- **Skills**: Markdown-defined capabilities (e.g., \`skills_brand_guidelines\`). Call via \`skill\` tool or \`skills_*\` dynamic tools (if present).
- **Workflows**: Inline templates triggered by \`//name\` (e.g., \`//commit_review\`). Do NOT call them; just mention them.
  - **ALREADY EXPANDED**: If you see \`<workflow name="X">\` XML in the conversation, the content is RIGHT THERE - just follow it directly. Do NOT call \`list_workflows\` or \`get_workflow\` to look it up again.
  - **ORPHAN REF RECOVERY**: If you see \`[use_workflow:X-id]\` but cannot find the corresponding \`<workflow name="X">\` content in the conversation, use the \`get_workflow\` tool to retrieve it.
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

      const activeAgent = (input as any).agent as string | undefined;
      const catalogEntries = [...workflows.values()]
        .filter(w => w.autoworkflow)
        .filter(w => w.agents.length === 0 || (activeAgent && w.agents.includes(activeAgent)))
        .map(w => {
          const tagsStr = w.tags.length > 0 ? ` [${w.tags.join(', ')}]` : '';
          const aliasStr = w.aliases.length > 0 ? ` (aliases: ${w.aliases.join(', ')})` : '';
          return `//${w.name}${aliasStr}: ${w.description || 'No description'}${tagsStr}`;
        });

      if (catalogEntries.length > 0) {
        output.system.push(
          `<workflow-catalog>\n${catalogEntries.join('\n')}\n</workflow-catalog>\n` +
          `If user's request matches a workflow's tags or description, suggest it.`
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
        const messageID = _input.messageID || '';

        if (!sessionWorkflows.has(sessionID)) {
          sessionWorkflows.set(sessionID, new Map());
        }
        const workflowRefs = sessionWorkflows.get(sessionID)!;

        for (const part of output.parts) {
          if (part.type === "text" && "text" in part) {
            const textPart = part as { type: "text"; text: string };
            const mentions = detectWorkflowMentions(textPart.text);

            if (mentions.length === 0) {
              const activeAgent = _input.agent;
              const userContent = textPart.text.toLowerCase();

              const hints = [...workflows.values()]
                .filter(w => w.autoworkflow)
                .filter(w => w.agents.length === 0 || (activeAgent && w.agents.includes(activeAgent)))
                .filter(w => {
                  const matchesTags = w.tags.some(t => userContent.includes(t.toLowerCase()));
                  const matchesDesc = w.description && userContent.includes(w.description.toLowerCase().slice(0, 20));
                  const matchesAlias = w.aliases.some(a => userContent.includes(a.toLowerCase()));
                  const matchesName = userContent.includes(w.name.toLowerCase());
                  return matchesTags || matchesDesc || matchesAlias || matchesName;
                })
                .map(w => `//${w.name}`);

              if (hints.length > 0) {
                textPart.text += `\n\n[Relevant workflows: ${hints.join(', ')}]`;
              }
              continue;
            }

            const found: string[] = [];
            const reused: string[] = [];
            const notFound: string[] = [];
            const suggestions = new Map<string, string[]>();
            let expanded = textPart.text;

            for (const { name, force, args } of mentions) {
              const canonicalName = findWorkflowByName(name, [...workflows.keys()]);
              const workflow = canonicalName ? workflows.get(canonicalName) : null;
              
              if (!workflow || !canonicalName) {
                notFound.push(name);
                const matches = findAllMatches(name, [...workflows.keys()], 3);
                if (matches.length > 0) suggestions.set(name, matches);
                continue;
              }

              const existingRef = workflowRefs.get(canonicalName);
              const shouldFullInject = force || !existingRef;

              if (shouldFullInject) {
                const id = shortId(messageID);
                workflowRefs.set(canonicalName, { id, messageID });
                found.push(canonicalName);
                
                const argsAsResolvers: Record<string, VariableResolver> = {};
                for (const [key, value] of Object.entries(args)) {
                  argsAsResolvers[`args.${key}`] = () => value;
                }
                
                const expandedContent = expandVariables(workflow.content, { ...contextVariables, ...argsAsResolvers });
                
                const mentionPatternStr = args && Object.keys(args).length > 0
                  ? `(?<![:\\\\w/])//${name}\\([^)]*\\)!?(?![\\\\w-])`
                  : `(?<![:\\\\w/])//${name}!?(?![\\\\w-])`;
                
                const fullContent = `\n\n<workflow name="${canonicalName}" id="${canonicalName}-${id}" source="${workflow.source}">\n${expandedContent}\n</workflow>\n\n`;

                if (config.deduplicateSameMessage) {
                  const firstPattern = new RegExp(mentionPatternStr);
                  expanded = expanded.replace(firstPattern, fullContent);

                  const remainingPattern = new RegExp(mentionPatternStr, 'g');
                  if (remainingPattern.test(expanded)) {
                    expanded = expanded.replace(
                      remainingPattern,
                      `[use_workflow:${canonicalName}-${id}]`
                    );
                    if (!reused.includes(canonicalName)) {
                      reused.push(canonicalName);
                    }
                  }
                } else {
                  const globalPattern = new RegExp(mentionPatternStr, 'g');
                  expanded = expanded.replace(globalPattern, fullContent);
                }
              } else {
                reused.push(canonicalName);
                expanded = expanded.replace(
                  new RegExp(`(?<![:\\\\w/])//${name}(?![\\\\w-])`, 'g'),
                  `[use_workflow:${canonicalName}-${existingRef.id}]`
                );
              }
            }

            const useWorkflowPattern = /\[use_workflow:([a-zA-Z0-9_-]+)-[a-zA-Z0-9]+\]/g;
            let refMatch;
            while ((refMatch = useWorkflowPattern.exec(expanded)) !== null) {
              const refName = refMatch[1];
              const hasFullExpansion = expanded.includes(`<workflow name="${refName}"`);
              if (!hasFullExpansion) {
                const workflow = workflows.get(refName);
                if (workflow) {
                  const id = shortId(messageID);
                  workflowRefs.set(refName, { id, messageID });
                  if (!found.includes(refName)) {
                    found.push(refName);
                  }
                  const idx = reused.indexOf(refName);
                  if (idx !== -1) {
                    reused.splice(idx, 1);
                  }
                  
                  const fullContent = `\n\n<workflow name="${refName}" id="${refName}-${id}" source="${workflow.source}">\n${workflow.content}\n</workflow>\n\n`;
                  expanded = expanded.replace(refMatch[0], fullContent);
                  useWorkflowPattern.lastIndex = 0;
                }
              }
            }

            if (found.length === 0 && reused.length === 0 && notFound.length === 0) continue;

            textPart.text = expanded;

            const toastParts: string[] = [];
            let toastVariant: "success" | "info" | "warning" = "success";

            if (found.length > 0) {
              toastParts.push(`✓ Expanded: ${found.join(', ')}`);
            }
            if (reused.length > 0) {
              toastParts.push(`↺ Referenced: ${reused.join(', ')}`);
              if (toastVariant === "success" && found.length === 0) toastVariant = "info";
            }
            if (notFound.length > 0) {
              toastVariant = "warning";
              const suggestionMsg = [...suggestions.entries()]
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
                toastParts.push(`✗ Not found: ${notFound.join(', ')}`);
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
        description: 'Create a new workflow template. ASK the user: 1) project or global scope? 2) any shortcuts/aliases they want? Workflows are created with YAML frontmatter.',
        args: {
          name: tool.schema.string().describe('The workflow name (without // prefix)'),
          content: tool.schema.string().describe('The markdown content of the workflow (without frontmatter - it will be added automatically)'),
          scope: tool.schema.enum(['global', 'project']).describe('Where to save: global (~/.config/opencode/workflows/) or project (.opencode/workflows/)').optional(),
          shortcuts: tool.schema.string().describe('Comma-separated shortcuts/aliases for the workflow, e.g., "cr, review_commit"').optional(),
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
          const frontmatter = `---\nshortcuts: [${shortcutArray.join(', ')}]\n---\n`;
          const fullContent = frontmatter + args.content;

          writeFileSync(filePath, fullContent, 'utf-8');
          workflows = loadWorkflows(directory);
          
          const shortcutMsg = shortcutArray.length > 0 
            ? `\nShortcuts: ${shortcutArray.map(a => `//${a}`).join(', ')}`
            : '\nNo shortcuts set (can be added later by editing the file)';
          return `Workflow "//${args.name}" created successfully in ${scope} scope.\nPath: ${filePath}${shortcutMsg}`;
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

export { loadConfig, expandWorkflowMentions, WorkflowConfig, WorkflowInfo };
