import type { Plugin, PluginInput, Hooks } from '@opencode-ai/plugin';
import type { Part, UserMessage } from '@opencode-ai/sdk';
import { tool } from '@opencode-ai/plugin';
import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, renameSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';

interface WorkflowInfo {
  name: string;
  aliases: string[];
  content: string;
  source: 'project' | 'global';
  path: string;
}

function parseFrontmatter(fileContent: string): { aliases: string[], body: string } {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
  const match = fileContent.match(frontmatterRegex);

  if (!match) {
    return { aliases: [], body: fileContent };
  }

  const yaml = match[1];
  const body = fileContent.slice(match[0].length);
  const aliases: string[] = [];

  const aliasMatch = yaml.match(/^(?:aliases|shortcuts):\s*(?:\[(.*?)\]|(.*))/m);
  if (aliasMatch) {
    const rawAliases = aliasMatch[1] || aliasMatch[2];
    if (rawAliases) {
      rawAliases.split(',').forEach(a => {
        const clean = a.trim().replace(/['"]/g, '');
        if (clean) aliases.push(clean);
      });
    }
  }

  return { aliases, body };
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
          const { aliases, body } = parseFrontmatter(rawContent);
          
          const info: WorkflowInfo = { name, aliases, content: body, source, path: filePath };
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

const WORKFLOW_MENTION_PATTERN = /(?<![:\w/])\/\/([a-zA-Z0-9][a-zA-Z0-9_-]*)/g;

function detectWorkflowMentions(text: string): string[] {
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  
  WORKFLOW_MENTION_PATTERN.lastIndex = 0;

  while ((match = WORKFLOW_MENTION_PATTERN.exec(text)) !== null) {
    matches.push(match[1]);
  }
  
  return [...new Set(matches)];
}

function findBestMatch(typo: string, candidates: string[]): string | null {
  const prefixMatch = candidates.find(c => c.startsWith(typo));
  if (prefixMatch) return prefixMatch;

  const partialMatch = candidates.find(c => c.includes(typo));
  if (partialMatch) return partialMatch;

  return null;
}

function expandWorkflowMentions(
  text: string,
  workflows: Map<string, WorkflowInfo>
): { expanded: string; found: string[]; notFound: string[]; suggestions: Map<string, string> } {
  const mentions = detectWorkflowMentions(text);
  const found: string[] = [];
  const notFound: string[] = [];
  const suggestions = new Map<string, string>();
  let expanded = text;

  for (const mention of mentions) {
    const workflow = workflows.get(mention);
    if (workflow) {
      found.push(mention);
      expanded = expanded.replace(
        new RegExp(`(?<![:\\w/])//${mention}(?![\\w-])`, 'g'),
        `\n\n<workflow name="${mention}" source="${workflow.source}">\n${workflow.content}\n</workflow>\n\n`
      );
    } else {
      notFound.push(mention);
      const match = findBestMatch(mention, [...workflows.keys()]);
      if (match) {
        suggestions.set(mention, match);
      }
    }
  }

  return { expanded, found, notFound, suggestions };
}

function buildWorkflowContext(found: string[], notFound: string[], suggestions: Map<string, string>): string {
  let context = `\n\n<workflows-context>\n`;
  
  if (found.length > 0) {
    context += `Expanded ${found.length} workflow(s): ${found.join(', ')}\n`;
  }
  
  if (notFound.length > 0) {
    context += `Unknown workflows (not found): ${notFound.join(', ')}\n`;
    suggestions.forEach((suggestion, typo) => {
      context += `SUGGESTION: User typed "//${typo}". Did they mean "//${suggestion}"? If so, please ask them.\n`;
    });
  }
  
  if (found.length > 0) {
    context += `INSTRUCTION: Apply ALL workflow instructions above to your response.\n`;
  }
  
  context += `</workflows-context>\n`;
  return context;
}

const DISTINCTION_RULE = `
<system-rule>
**DISTINCTION RULE**:
- **Tools**: Native functions provided by plugins (e.g., \`create_workflow\`, \`rename_workflow\`). Call them directly.
- **Skills**: Markdown-defined capabilities (e.g., \`skills_brand_guidelines\`). Call via \`skill\` tool or \`skills_*\` dynamic tools (if present).
- **Workflows**: Inline templates triggered by \`//name\` (e.g., \`//commit_review\`). Do NOT call them; just mention them.
</system-rule>
`;

export const WorkflowsPlugin: Plugin = async (ctx: PluginInput) => {
  const { directory } = ctx;
  let workflows = loadWorkflows(directory);

  const workflowNames = [...workflows.keys()].join(', ') || '(none)';
  console.log(`Workflows: ${workflows.size} available [${workflowNames}]`);

  return {
    // Inject DISTINCTION_RULE into system prompt
    "experimental.chat.system.transform": async (
      _input: Record<string, never>,
      output: { system: string[] }
    ) => {
      const hasRule = output.system.some(s => s.includes("DISTINCTION RULE"));
      if (!hasRule) {
        output.system.push(DISTINCTION_RULE);
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

        for (const part of output.parts) {
          if (part.type === "text" && "text" in part) {
            const textPart = part as { type: "text"; text: string };
            const mentions = detectWorkflowMentions(textPart.text);
            
            if (mentions.length === 0) continue;

            const { expanded, found, notFound, suggestions } = expandWorkflowMentions(
              textPart.text,
              workflows
            );

            if (found.length === 0 && notFound.length === 0) continue;

            const workflowContext = buildWorkflowContext(found, notFound, suggestions);

            if (found.length === 0) {
              textPart.text = `${textPart.text}\n\n${workflowContext}`;
            } else {
              textPart.text = expanded + workflowContext;
            }

            console.log(`[opencode-workflows] Expanded ${found.length} workflow(s): ${found.join(', ')}`);
          }
        }
      } catch (error) {
        console.error("[opencode-workflows] Error in chat.message hook", error);
      }
    },

    event: async ({ event }) => {
      // @ts-ignore - event.type exists at runtime
      if (event.type === 'session.created') {
        workflows = loadWorkflows(directory);
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
          const { expanded, found, notFound } = expandWorkflowMentions(args.text, workflows);

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
            .map((w) => `- //${w.name} [${w.source}]: ${w.content.slice(0, 80).replace(/\n/g, ' ').trim()}...`)
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
          const newCount = workflows.size;

          const workflowList = [...workflows.keys()].map((w) => `//${w}`).join(', ') || 'none';
          return `Workflows reloaded.\n\nPrevious: ${oldCount}\nCurrent: ${newCount}\nAvailable: ${workflowList}`;
        },
      }),
    },
  };
};
