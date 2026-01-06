# opencode-captain Architecture

> The Captain gives orders (workflows), sets the rules (constraints), and assembles the crew (agents).

## Overview

This plugin unifies **Orders** (dynamic instructions), **Rules** (static constraints), and **Crews** (agent definitions) into a single prompt injection engine for OpenCode.

| Concept | Primary Folder | Aliases | Behavior | Trigger |
|---------|----------------|---------|----------|---------|
| **Orders** | `orders/` | `workflows/`, `commands/` | Dynamic instructions | User mentions `//name` |
| **Rules** | `rules/` | `creeds/`, `code/` | Static constraints | Auto-injected every message |
| **Crew** | `crew/` | `agents/`, `mates/` | Agent definitions | Agent spawning via config hook |

## Core Principles

### 1. Folder = Type
The folder location determines the prompt type. No `type:` frontmatter needed.

### 2. Backwards Compatibility
All folder aliases work. Users can use `workflows/` or `orders/` interchangeably.

### 3. Configurable Naming
Users can customize folder names and messaging via config.

## Folder Structure

```
.opencode/
├── orders/          # Captain's Orders (workflows)
│   ├── 5-approaches.md
│   └── security-audit.md
├── rules/           # The Rules (constraints)
│   ├── global-style.md
│   └── oracle-guidelines.md
└── crew/            # The Crew (agent definitions)
    └── frontend-specialist.md

# All of these also work (backwards compat):
├── workflows/       # Alias for orders/
├── creeds/          # Alias for rules/
├── code/            # Alias for rules/
├── commands/        # Alias for orders/
├── agents/          # Alias for crew/
└── mates/           # Alias for crew/
```

## Configuration

```jsonc
// ~/.config/opencode/captain.json
{
  // Folder aliases (all are checked, first existing wins for display name)
  "folders": {
    "orders": ["orders", "workflows", "commands"],
    "rules": ["rules", "creeds", "code"],
    "crew": ["crew", "agents", "mates"]
  },
  
  // Messaging theme (auto-detected from folder name, or override)
  "theme": "pirate",  // "pirate" | "standard" | "custom"
  
  // Custom messages (when theme = "custom")
  "messages": {
    "ordersMatched": "⚡ Orders matched",
    "crewAssembled": "🏴‍☠️ Crew assembled"
  },
  
  // Existing config
  "deduplicateSameMessage": true,
  "maxNestingDepth": 3
}
```

## Messaging Theme

| Event | Standard Theme | Pirate Theme |
|-------|----------------|--------------|
| Workflow matched | `⚡ Workflow matched` | `⚡ Orders matched` |
| Workflow expanded | `✓ Expanded: X` | `✓ Orders executed: X` |
| Suggestions | `Did you mean?` | `Did ye mean, matey?` |

**Note**: Rules are injected silently — no notifications. They're just there.

**Auto-detection**: If user has `orders/` folder, use pirate theme. If `workflows/`, use standard.

## Plugin Structure

```
opencode-captain/
├── src/
│   ├── index.ts                 # Plugin entry point
│   │
│   ├── core/                    # Shared infrastructure
│   │   ├── types.ts             # BasePrompt, TagEntry, TagOrGroup, etc.
│   │   ├── parser.ts            # parseFrontmatter, parseArrayField, parseTagsField
│   │   ├── storage.ts           # walkDir, getDirs, loadPrompts (generic loader)
│   │   ├── matcher.ts           # normalize, findByName, findBestMatch, findAllMatches
│   │   ├── variables.ts         # expandVariables, BUILTIN_VARIABLES, VariableResolver
│   │   ├── config.ts            # loadConfig, folder resolution, theme detection
│   │   └── utils.ts             # shortId, showToast
│   │
│   ├── orders/                  # Order-specific logic (workflows)
│   │   ├── types.ts             # Order, OrderRef, ExpansionResult, etc.
│   │   ├── engine.ts            # //mention detection, expansion, nesting
│   │   ├── automention.ts       # findMatchingAutoOrders, formatHints
│   │   ├── tools.ts             # list_orders, get_order, create_order, etc.
│   │   └── hooks.ts             # chat.message processing
│   │
│   ├── rules/                   # Rule-specific logic (constraints)
│   │   ├── types.ts             # Rule interface
│   │   ├── engine.ts            # Rule filtering by agent
│   │   ├── tools.ts             # list_rules, get_rule, create_rule, etc.
│   │   └── hooks.ts             # chat.params injection
│   │
│   └── crew/                   # Crew-specific logic (agents) - Future
│       ├── types.ts             # CrewMember interface
│       ├── engine.ts            # Crew management
│       └── tools.ts             # list_crew, get_crew, etc.
│
├── tests/                       # Mirror src/ structure
│   ├── core/
│   ├── orders/
│   ├── rules/
│   └── crew/
│
└── docs/
    └── architecture.md          # This file
```

## Type System

### Shared Base Type

```typescript
// core/types.ts

interface TagOrGroup {
  or: string[];
}

type TagEntry = string | (string | TagOrGroup)[] | TagOrGroup;
type PromptType = 'order' | 'rule' | 'crew';

interface BasePrompt {
  name: string;
  description: string;
  aliases: string[];
  tags: TagEntry[];
  onlyFor: string[];          // Agent visibility filter
  content: string;
  source: 'project' | 'global';
  path: string;
  folder?: string;            // Subfolder for organization
  promptType: PromptType;     // Derived from folder location
}
```

### Order Type (Workflows)

```typescript
// orders/types.ts

type AutomentionMode = 'true' | 'expanded' | 'false';
type OrderInOrderMode = 'true' | 'hints' | 'false';

interface SpawnAtEntry {
  agent: string;
  mode: 'hint' | 'expanded';
}

interface Order extends BasePrompt {
  promptType: 'order';
  automention: AutomentionMode;
  orderInOrder: OrderInOrderMode;  // Nested order expansion
  spawnAt: SpawnAtEntry[];
}

interface OrderRef {
  id: string;
  messageID: string;
  implicit?: boolean;
}

interface ExpansionResult {
  text: string;
  found: string[];
  reused: string[];
  notFound: string[];
  suggestions: Map<string, string[]>;
  hints: string[];
  warnings: string[];
  newRefs: Map<string, OrderRef>;
}
```

### Rule Type (Constraints)

```typescript
// rules/types.ts

interface Rule extends BasePrompt {
  promptType: 'rule';
  // Rules are simpler - just use onlyFor for agent filtering
  // No automention, no spawnAt, no nesting
}
```

### Crew Type (Agents)

```typescript
// crew/types.ts

interface Crew extends BasePrompt {
  promptType: 'crew';
  
  // Agent configuration (maps to opencode's AgentConfig)
  model?: string;           // Override model for this agent
  temperature?: number;     // Override temperature
  tools?: string[];         // Enabled tools list (e.g., ['write', 'edit', 'bash'])
  mode?: 'agent' | 'subagent';  // Default: 'subagent'
}

interface ParsedCrewFrontmatter {
  aliases: string[];
  tags: TagEntry[];
  onlyFor: string[];
  description: string;
  body: string;
  
  // Crew-specific
  model?: string;
  temperature?: number;
  tools?: string[];       // Parsed from comma-separated string
  mode?: 'agent' | 'subagent';
}


## Storage Layer

### Folder Resolution with Aliases

```typescript
// core/storage.ts

const FOLDER_ALIASES: Record<PromptType, string[]> = {
  order: ['orders', 'workflows', 'commands'],
  rule: ['rules', 'creeds', 'code'],
  crew: ['crews', 'agents', 'crew'],
};

function getPromptDirs(
  projectDir: string, 
  promptType: PromptType
): { path: string; source: 'project' | 'global'; folderName: string }[] {
  const aliases = FOLDER_ALIASES[promptType];
  const dirs: { path: string; source: 'project' | 'global'; folderName: string }[] = [];
  
  for (const alias of aliases) {
    // Project scope
    const projectPath = join(projectDir, '.opencode', alias);
    if (existsSync(projectPath)) {
      dirs.push({ path: projectPath, source: 'project', folderName: alias });
    }
    
    // Global scope
    const globalPath = join(homedir(), '.config', 'opencode', alias);
    if (existsSync(globalPath)) {
      dirs.push({ path: globalPath, source: 'global', folderName: alias });
    }
  }
  
  return dirs;
}
```

### Theme Detection

```typescript
// core/config.ts

type Theme = 'pirate' | 'standard';

function detectTheme(projectDir: string): Theme {
  // Check which folders exist
  const hasPirateFolders = 
    existsSync(join(projectDir, '.opencode', 'orders')) ||
    existsSync(join(homedir(), '.config', 'opencode', 'orders'));
  
  return hasPirateFolders ? 'pirate' : 'standard';
}

function getMessage(key: string, theme: Theme): string {
  const messages: Record<Theme, Record<string, string>> = {
    pirate: {
      ordersMatched: '⚡ Orders matched',
      orderExpanded: '✓ Orders executed',
      didYouMean: 'Did ye mean, matey?',
      notFound: 'Order not found in the Captain\'s log',
    },
    standard: {
      ordersMatched: '⚡ Workflow matched',
      orderExpanded: '✓ Expanded',
      didYouMean: 'Did you mean?',
      notFound: 'Workflow not found',
    },
  };
  
  return messages[theme][key] || messages.standard[key];
}
```

## Plugin Hooks

### chat.params (Rule Injection)

Rules are **silently** injected into the system prompt on **every message**. No notifications.

```typescript
"chat.params": async (params) => {
  const activeAgent = params.input?.agent;
  
  // Load rules matching this agent (silent - no toast)
  const matchingRules = filterRulesByAgent(rules, activeAgent);
  
  // Build rules content
  const rulesContent = buildRulesSystemPrompt(matchingRules);
  
  // Append to existing system prompt
  params.input.systemPrompt += rulesContent;
}
```

### chat.message (Order Expansion)

Orders are expanded when user mentions `//name`.

```typescript
"chat.message": async (input, output) => {
  const theme = detectTheme(directory);
  
  for (const part of output.parts) {
    if (part.type === "text") {
      const mentions = detectOrderMentions(part.text);
      
      if (mentions.length > 0) {
        part.text = expandOrderMentions(part.text, orders);
      } else {
        // Check for auto-mentions based on tags
        const autoResult = findMatchingAutoOrders(part.text, orders);
        if (autoResult.length > 0) {
          part.text += formatAutoApplyHint(autoResult, orders, theme);
        }
      }
    }
  }
}
```

## Backwards Compatibility

### Tool Aliases

Both naming conventions work:

```typescript
// These all do the same thing:
list_workflows()  // Standard name
list_orders()     // Pirate name

get_workflow("X")
get_order("X")

create_workflow(...)
create_order(...)
```

### Frontmatter Aliases

```yaml
# Both work:
workflowInWorkflow: true
orderInOrder: true

# Both work:
automention: true
autoorder: true
```

## Migration Path

### Phase 1: Restructure (No New Features)
1. Create `core/` with shared code
2. Move workflow-specific code to `orders/`
3. Add folder aliasing (orders/workflows/commands)
4. Ensure all existing tests pass
5. No behavior changes

### Phase 2: Add Rules Support
1. Create `rules/` module
2. Add rules loading with aliases (rules/creeds/code)
3. Add rules injection hook (silent, no notifications)
4. Add rules tools (list, get, create, edit, delete)
5. Add tests for rules

### Phase 3: Theme & Config
1. Add theme detection (pirate vs standard)
2. Add configurable messaging
3. Update toast messages based on theme

### Phase 4: Crews (Agent Definitions)

Crews are user-defined agents loaded from markdown files. They leverage ALL existing infrastructure.

**What Crews Are:**
- Markdown files in `crew/`, `agents/`, or `mates/` folders
- Converted to opencode's `AgentConfig` objects
- Registered with `config.agent` so Task tool can invoke them
- NO custom orchestration - uses opencode's built-in Task tool

**What Crews Are NOT:**
- NOT our own agent runtime
- NOT async agent calls (use opencode's sync Task tool)
- NOT agent-to-agent protocols (let prompts say "use Task to call X")

#### Phase 4 Tasks

| Task ID | File | Description |
|---------|------|-------------|
| p4-1 | `src/crew/types.ts` | Crew interface extending BasePrompt, ParsedCrewFrontmatter |
| p4-2 | `src/crew/parser.ts` | parseCrewFrontmatter using core parser + crew-specific fields |
| p4-3 | `src/crew/engine.ts` | crewToAgentConfig() converter, filterCrewsByAgent() |
| p4-4 | `src/crew/tools.ts` | loadCrews, createCrewsState, listCrews, getCrew, createCrew, editCrew, deleteCrew, renameCrew |
| p4-5 | `src/crew/hooks.ts` | registerCrewsWithConfig() - adds crew to config.agent |
| p4-6 | `src/crew/index.ts` | Barrel export |
| p4-7 | `src/index.ts` | Import crews, load on startup, register in config hook, add 6 crew tools |
| p4-8 | `tests/crews.test.ts` | Unit tests for crews module |

#### Crew File Format

```markdown
---
description: "Marketing copywriter for headlines and body copy"
model: anthropic/claude-sonnet-4
temperature: 0.7
tools: write, edit, webfetch
mode: subagent
onlyFor: [marketer, content-team]
---
# Copywriter Agent

You are a world-class copywriter specializing in...

## Guidelines
- Write headlines that grab attention
- Use the brand voice from our style guide
```

#### Integration with OpenCode

```typescript
// In config hook:
config: async (config) => {
  // Convert crews to AgentConfig objects
  const crewAgents = crewsToAgentConfigs(state.crews);
  
  // Register with opencode's agent system
  config.agent = {
    ...config.agent,
    ...crewAgents,
  };
}

// crewToAgentConfig converter:
function crewToAgentConfig(crew: Crew): AgentConfig {
  return {
    description: crew.description,
    mode: crew.mode || 'subagent',
    prompt: crew.content,
    model: crew.model,
    temperature: crew.temperature,
    tools: crew.tools 
      ? Object.fromEntries(crew.tools.map(t => [t, true]))
      : undefined,
  };
}
```

#### Use Case: Marketer → Copywriter Delegation

**`crew/marketer.md`:**
```markdown
---
description: "Marketing strategist who coordinates campaigns"
model: anthropic/claude-sonnet-4
tools: write, edit, task
---
# Marketer Agent

You coordinate marketing campaigns.

## Delegation
When you need copy written:
- Use the Task tool to invoke the "copywriter" agent
- Provide clear briefs with target audience and tone
- Review and iterate on the output
```

**`crew/copywriter.md`:**
```markdown
---
description: "Expert copywriter for headlines and body copy"
model: anthropic/claude-sonnet-4
temperature: 0.8
tools: write, edit
---
# Copywriter Agent

You write compelling marketing copy...
```

**How It Works:**
1. User invokes marketer via Task tool
2. Marketer's prompt tells it to use Task tool for copywriter
3. opencode handles the invocation - we just provide the agent configs

### Phase 5: Rename & Release
1. Rename package to `opencode-captain`
2. Update README with pirate theme
3. Update version to 2.0.0

## Function Migration Map

### To `core/parser.ts`
- `parseFrontmatter()` (generalized)
- `parseArrayField()`
- `parseTagsField()`

### To `core/matcher.ts`
- `normalize()`
- `findByName()` (renamed from `findWorkflowByName`)
- `findBestMatch()`
- `findAllMatches()`
- `isOrGroup()`
- `matchesTagItem()`

### To `core/storage.ts`
- `walkDir()`
- `getPromptDirs()` (with alias support)
- `loadPrompts()` (generic loader)
- `getPromptPath()` (generalized)
- `savePrompt()` (generalized)
- `deletePrompt()` (generalized)
- `FOLDER_ALIASES` constant

### To `core/config.ts`
- `loadConfig()`
- `detectTheme()`
- `getMessage()`

### To `core/variables.ts`
- `BUILTIN_VARIABLES`
- `expandVariables()`
- `VariableResolver` type

### To `core/utils.ts`
- `shortId()`
- `showToast()`

### To `orders/engine.ts`
- `ORDER_MENTION_PATTERN` (was WORKFLOW_MENTION_PATTERN)
- `OrderMention` interface
- `detectOrderMentions()`
- `expandOrderMentions()`
- `expandNestedOrders()`
- `expandOrphanOrderRefs()`
- `extractOrderReferences()`
- `processMessageText()`
- `parseOrderArgs()`
- `parseSpawnAtField()`

### To `orders/automention.ts`
- `findMatchingAutoOrders()`
- `findSpawnOrders()`
- `formatAutoApplyHint()` (theme-aware)
- `formatSuggestion()` (theme-aware)
- `formatUserHint()` (theme-aware)

### To `orders/tools.ts`
- `list_orders` (alias: `list_workflows`)
- `get_order` (alias: `get_workflow`)
- `create_order` (alias: `create_workflow`)
- `edit_order` (alias: `edit_workflow`)
- `delete_order` (alias: `delete_workflow`)
- `rename_order` (alias: `rename_workflow`)
- `reload_orders` (alias: `reload_workflows`)
- `expand_orders` (alias: `expand_workflows`)

### To `orders/hooks.ts`
- `chat.message` handler logic
- Session state management

### To `rules/engine.ts`
- `filterRulesByAgent()`
- `buildRulesSystemPrompt()`

### To `rules/tools.ts`
- `list_rules` (alias: `list_creeds`)
- `get_rule` (alias: `get_creed`)
- `create_rule` (alias: `create_creed`)
- `edit_rule` (alias: `edit_creed`)
- `delete_rule` (alias: `delete_creed`)
- `reload_rules` (alias: `reload_creeds`)

### To `rules/hooks.ts`
- `chat.params` handler for silent rule injection

### To `crew/types.ts`
- `Crew` interface (extends BasePrompt)
- `ParsedCrewFrontmatter` interface

### To `crew/parser.ts`
- `parseCrewFrontmatter()` - parses crew-specific frontmatter (model, temperature, tools, mode)

### To `crew/engine.ts`
- `crewToAgentConfig()` - converts Crew to opencode's AgentConfig
- `crewsToAgentConfigs()` - batch convert all crews
- `filterCrewsByAgent()` - optional agent filtering

### To `crew/tools.ts`
- `loadCrews()` - load crews from disk
- `createCrewsState()` - initialize state
- `listCrews()` - list available crews
- `getCrew()` - get crew by name
- `createCrew()` - create new crew
- `editCrew()` - edit existing crew
- `deleteCrew()` - delete crew
- `renameCrew()` - rename crew
- `reloadCrews()` - reload from disk

### To `crew/hooks.ts`
- `registerCrewsWithConfig()` - adds crews to config.agent in config hook
