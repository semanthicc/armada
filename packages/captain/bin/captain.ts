#!/usr/bin/env bun
import { existsSync, writeFileSync, unlinkSync, renameSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { normalizeArrayInput } from '../src/utils';

type Command = 'create' | 'edit' | 'delete' | 'rename' | 'list' | 'reload' | 'help';
type ItemType = 'workflow' | 'rule' | 'crew';
type Scope = 'global' | 'project';

interface CommandOptions {
  scope?: Scope;
  content?: string;
  description?: string;
  shortcuts?: string;
  tags?: string;
  automention?: 'true' | 'expanded' | 'false';
  expand?: 'true' | 'false';
  onlyFor?: string;
  spawnAt?: string;
  include?: string;
  tools?: string;
  model?: string;
  mode?: 'agent' | 'subagent';
  temperature?: string;
  newName?: string;
}

const VALID_COMMANDS: readonly Command[] = ['create', 'edit', 'delete', 'rename', 'list', 'reload', 'help'] as const;
const VALID_TYPES: readonly ItemType[] = ['workflow', 'rule', 'crew'] as const;

const FOLDER_MAP: Record<ItemType, string> = {
  workflow: 'workflows',
  rule: 'rules',
  crew: 'crew',
};

const HELP = `
Captain CLI - Manage workflows, rules, and crews

USAGE:
  captain <command> <type> <name> [options]

COMMANDS:
  create    Create new item
  edit      Edit existing item (overwrites content)
  delete    Delete item
  rename    Rename item
  list      List all items
  reload    Reload from disk (no-op for CLI)

TYPES:
  workflow  Workflow/scroll templates
  rule      Rules/constraints for agents
  crew      Crew agent definitions

OPTIONS:
  --scope <global|project>   Where to save (default: global)
  --content <string>         Content for create/edit
  --description <string>     Short description
  --shortcuts <string>       Comma-separated shortcuts (workflows only)
  --tags <string>            Comma-separated tags (workflows only)
  --automention <string>     true|expanded|false (workflows only)
  --expand <string>          true|false (workflows only)
  --onlyFor <string>         Comma-separated agent names
  --spawnAt <string>         Agent spawn triggers (workflows only)
  --include <string>         Files to include (workflows only)
  --tools <string>           Comma-separated tools (crews only)
  --model <string>           Model name (crews only)
  --mode <string>            agent|subagent (crews only)
  --temperature <number>     Temperature (crews only)
  --newName <string>         New name for rename command

EXAMPLES:
  captain create workflow my-flow --content "# My Flow" --shortcuts "mf, myflow"
  captain create rule no-any --content "Never use 'any' type" --onlyFor "build"
  captain create crew reviewer --content "You review code" --mode subagent
  captain delete workflow old-flow --scope project
  captain rename workflow old-name --newName new-name
  captain list workflow --scope global
`;

function isValidCommand(cmd: string): cmd is Command {
  return VALID_COMMANDS.includes(cmd as Command);
}

function isValidType(t: string): t is ItemType {
  return VALID_TYPES.includes(t as ItemType);
}

function getDir(type: ItemType, scope: Scope): string {
  const folder = FOLDER_MAP[type];
  return scope === 'global'
    ? join(homedir(), '.config', 'opencode', folder)
    : join(process.cwd(), '.opencode', folder);
}

function getPath(name: string, type: ItemType, scope: Scope): string {
  return join(getDir(type, scope), `${name}.md`);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function parseArgs(args: string[]): CommandOptions {
  const result: CommandOptions = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2) as keyof CommandOptions;
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
      (result as Record<string, string>)[key] = value;
      if (value !== 'true') i++;
    }
  }
  return result;
}

function buildWorkflowFrontmatter(opts: CommandOptions): string {
  const lines: string[] = ['---'];
  
  if (opts.description) lines.push(`description: ${opts.description}`);
  
  const shortcuts = normalizeArrayInput(opts.shortcuts, 'shortcuts');
  const tags = normalizeArrayInput(opts.tags, 'tags');
  const onlyFor = normalizeArrayInput(opts.onlyFor, 'onlyFor');
  const spawnAt = normalizeArrayInput(opts.spawnAt, 'spawnAt');
  const include = normalizeArrayInput(opts.include, 'include');
  
  if (shortcuts.length) lines.push(`shortcuts: [${shortcuts.join(', ')}]`);
  if (tags.length) lines.push(`tags: [${tags.join(', ')}]`);
  if (opts.automention) lines.push(`automention: ${opts.automention}`);
  if (opts.expand) lines.push(`expand: ${opts.expand}`);
  if (onlyFor.length) lines.push(`onlyFor: [${onlyFor.join(', ')}]`);
  if (spawnAt.length) lines.push(`spawnAt: [${spawnAt.join(', ')}]`);
  if (include.length) lines.push(`include: [${include.join(', ')}]`);
  
  lines.push('---');
  return lines.join('\n');
}

function buildRuleFrontmatter(opts: CommandOptions): string {
  const lines: string[] = ['---'];
  
  if (opts.description) lines.push(`description: ${opts.description}`);
  
  const onlyFor = normalizeArrayInput(opts.onlyFor, 'onlyFor');
  if (onlyFor.length) lines.push(`onlyFor: [${onlyFor.join(', ')}]`);
  
  lines.push('---');
  return lines.join('\n');
}

function buildCrewFrontmatter(opts: CommandOptions): string {
  const lines: string[] = ['---'];
  
  if (opts.description) lines.push(`description: ${opts.description}`);
  if (opts.mode) lines.push(`mode: ${opts.mode}`);
  if (opts.model) lines.push(`model: ${opts.model}`);
  if (opts.temperature) lines.push(`temperature: ${opts.temperature}`);
  
  const tools = normalizeArrayInput(opts.tools, 'tools');
  const onlyFor = normalizeArrayInput(opts.onlyFor, 'onlyFor');
  
  if (tools.length) lines.push(`tools: [${tools.join(', ')}]`);
  if (onlyFor.length) lines.push(`onlyFor: [${onlyFor.join(', ')}]`);
  
  lines.push('---');
  return lines.join('\n');
}

function buildFrontmatter(type: ItemType, opts: CommandOptions): string {
  switch (type) {
    case 'workflow': return buildWorkflowFrontmatter(opts);
    case 'rule': return buildRuleFrontmatter(opts);
    case 'crew': return buildCrewFrontmatter(opts);
  }
}

function exitWithError(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function create(type: ItemType, name: string, opts: CommandOptions): void {
  const scope = opts.scope ?? 'global';
  const filePath = getPath(name, type, scope);
  
  if (existsSync(filePath)) {
    exitWithError(`${type} "${name}" already exists at ${filePath}`);
  }
  
  ensureDir(getDir(type, scope));
  
  const frontmatter = buildFrontmatter(type, opts);
  const content = opts.content ?? `# ${name}`;
  const fullContent = `${frontmatter}\n\n${content}`;
  
  writeFileSync(filePath, fullContent, 'utf-8');
  console.log(`Created ${type} "${name}" at ${filePath}`);
}

function edit(type: ItemType, name: string, opts: CommandOptions): void {
  const scope = opts.scope ?? 'global';
  const filePath = getPath(name, type, scope);
  
  ensureDir(getDir(type, scope));
  
  const content = opts.content ?? '';
  writeFileSync(filePath, content, 'utf-8');
  console.log(`Updated ${type} "${name}" at ${filePath}`);
}

function del(type: ItemType, name: string, opts: CommandOptions): void {
  const scope = opts.scope ?? 'global';
  const filePath = getPath(name, type, scope);
  
  if (!existsSync(filePath)) {
    exitWithError(`${type} "${name}" not found at ${filePath}`);
  }
  
  unlinkSync(filePath);
  console.log(`Deleted ${type} "${name}" from ${filePath}`);
}

function rename(type: ItemType, name: string, opts: CommandOptions): void {
  if (!opts.newName) {
    exitWithError('--newName is required for rename');
  }
  
  const scope = opts.scope ?? 'global';
  const oldPath = getPath(name, type, scope);
  const newPath = getPath(opts.newName, type, scope);
  
  if (!existsSync(oldPath)) {
    exitWithError(`${type} "${name}" not found at ${oldPath}`);
  }
  
  if (existsSync(newPath)) {
    exitWithError(`${type} "${opts.newName}" already exists at ${newPath}`);
  }
  
  renameSync(oldPath, newPath);
  console.log(`Renamed ${type} "${name}" to "${opts.newName}"`);
}

function list(type: ItemType, opts: CommandOptions): void {
  const scopes: Scope[] = opts.scope ? [opts.scope] : ['global', 'project'];
  let found = false;
  
  for (const scope of scopes) {
    const dir = getDir(type, scope);
    if (!existsSync(dir)) continue;
    
    const files = readdirSync(dir).filter(f => f.endsWith('.md'));
    if (files.length === 0) continue;
    
    found = true;
    console.log(`\n${scope.toUpperCase()} ${type}s (${dir}):`);
    for (const file of files) {
      console.log(`  - ${file.replace('.md', '')}`);
    }
  }
  
  if (!found) {
    console.log(`No ${type}s found.`);
  }
}

const [commandArg, typeArg, ...restArgs] = process.argv.slice(2);

if (!commandArg || commandArg === 'help' || commandArg === '--help' || commandArg === '-h') {
  console.log(HELP);
  process.exit(0);
}

if (!isValidCommand(commandArg)) {
  exitWithError(`Unknown command "${commandArg}". Use: ${VALID_COMMANDS.join(', ')}`);
}

if (!isValidType(typeArg)) {
  exitWithError(`Unknown type "${typeArg}". Use: ${VALID_TYPES.join(', ')}`);
}

const hasName = restArgs.length > 0 && !restArgs[0].startsWith('--');
const name = hasName ? restArgs[0] : undefined;
const optArgs = hasName ? restArgs.slice(1) : restArgs;
const opts = parseArgs(optArgs);
const command: Command = commandArg;
const itemType: ItemType = typeArg;

switch (command) {
  case 'create':
    if (!name) exitWithError('name is required');
    create(itemType, name, opts);
    break;
  case 'edit':
    if (!name) exitWithError('name is required');
    edit(itemType, name, opts);
    break;
  case 'delete':
    if (!name) exitWithError('name is required');
    del(itemType, name, opts);
    break;
  case 'rename':
    if (!name) exitWithError('name is required');
    rename(itemType, name, opts);
    break;
  case 'list':
    list(itemType, opts);
    break;
  case 'reload':
    console.log('Reload is handled by the plugin, not CLI.');
    break;
  case 'help':
    console.log(HELP);
    break;
}
