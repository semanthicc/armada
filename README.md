# opencode-captain

Captain your AI with **Orders**, **Rules**, and **Crew** - a unified prompt management system for OpenCode.

## What is this?

opencode-captain is a plugin that manages three types of prompt templates:

| Type | Trigger | Behavior | Use Case |
|------|---------|----------|----------|
| **Orders** | `//name` in messages | Expand on demand, toast notification | Dynamic workflows, review checklists |
| **Rules** | Automatic | Silent injection into system prompt | Coding standards, style guides |
| **Crew** | Config hook | Register as OpenCode agents | Custom agents, specialists, delegates |

## Quick Start

```
Review this auth system like //linus-torvalds and think about it //5-approaches

@backend/auth/service.go
```

The plugin automatically:
1. Detects the `//linus-torvalds` and `//5-approaches` mentions
2. Expands them into full content wrapped in `<workflow>` tags
3. Injects any matching rules silently into the system prompt
4. Registers crew members as available agents

---

## Orders (Dynamic Workflows)

Orders are triggered explicitly with `//name` syntax in your messages.

### Folder Locations

| Location | Scope | Priority |
|----------|-------|----------|
| `.opencode/orders/` | Project | Highest |
| `.opencode/workflows/` | Project | Highest |
| `.opencode/commands/` | Project | Highest |
| `~/.config/opencode/orders/` | Global | Lower |
| `~/.config/opencode/workflows/` | Global | Lower |
| `~/.config/opencode/commands/` | Global | Lower |

Project orders override global ones with the same name.

### Order File Format

**`~/.config/opencode/orders/my-order.md`** -> `//my-order`

```markdown
---
description: "Short description of what this order does"
shortcuts: [mo, my-o]
tags: [review, check, analyze]
automention: true
onlyFor: [oracle, frontend]
spawnAt: [frontend:expanded]
---
# My Custom Order

Instructions for the AI to follow when this order is mentioned.

## Step 1
Do this thing...
```

### Frontmatter Options

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Short description shown in catalog |
| `shortcuts` / `aliases` | array | Alternative names to trigger this order |
| `tags` | array | Keywords for auto-suggestion matching |
| `automention` | `true` / `expanded` / `false` | Auto-suggestion mode (default: `true`) |
| `orderInOrder` | `true` / `hints` / `false` | Nested order expansion mode (default: `false`) |
| `expand` | `true` / `false` | Expand full content on mention or inject hint (default: `true`) |
| `onlyFor` | array | Limit visibility to specific agents |
| `spawnAt` | array | Inject when agent spawns (e.g., `[frontend:expanded]`) |

### Order Tools

| Tool | Description |
|------|-------------|
| `list_workflows` | List all available orders |
| `get_workflow` | Get a specific order's content |
| `create_workflow` | Create a new order |
| `edit_workflow` | Edit an existing order |
| `rename_workflow` | Rename an order |
| `delete_workflow` | Delete an order |
| `reload_workflows` | Reload orders from disk |
| `expand_workflows` | Manually expand `//mentions` in text |

---

## Rules (Silent Constraints)

Rules are automatically injected into the system prompt based on the active agent. They run silently without toast notifications.

### Folder Locations

| Location | Scope |
|----------|-------|
| `.opencode/rules/` | Project |
| `.opencode/creeds/` | Project |
| `.opencode/code/` | Project |
| `~/.config/opencode/rules/` | Global |
| `~/.config/opencode/creeds/` | Global |
| `~/.config/opencode/code/` | Global |

### Rule File Format

**`~/.config/opencode/rules/typescript-style.md`**

```markdown
---
description: "TypeScript coding standards"
onlyFor: [frontend, oracle]
---
# TypeScript Style Guide

- Use `const` over `let` where possible
- Prefer explicit return types on functions
- Use strict null checks
```

### Frontmatter Options

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Short description |
| `onlyFor` | array | Only inject for these agents (empty = all agents) |

### Rule Tools

| Tool | Description |
|------|-------------|
| `list_rules` | List all available rules |
| `get_rule` | Get a specific rule's content |
| `create_rule` | Create a new rule |
| `edit_rule` | Edit an existing rule |
| `delete_rule` | Delete a rule |
| `reload_rules` | Reload rules from disk |

### How Rules Work

1. On every message, the plugin checks the active agent
2. Rules with matching `onlyFor` (or no `onlyFor`) are collected
3. Rule content is injected into the system prompt
4. No toast notification - completely silent

**Example**: A `typescript-style` rule with `onlyFor: [frontend]` only injects when the `frontend` agent is active.

---

## Crew (Agent Definitions)

Crew members are markdown files that define custom agents. They're registered with OpenCode via the `config` hook and can be invoked using the Task tool.

### Folder Locations

| Location | Scope |
|----------|-------|
| `.opencode/crew/` | Project |
| `.opencode/agents/` | Project |
| `.opencode/mates/` | Project |
| `~/.config/opencode/crew/` | Global |
| `~/.config/opencode/agents/` | Global |
| `~/.config/opencode/mates/` | Global |

### Crew File Format

**`~/.config/opencode/crew/code-reviewer.md`**

```markdown
---
description: "Expert code reviewer"
model: claude-3-opus
temperature: 0.3
tools: [read, glob, grep]
mode: subagent
onlyFor: [oracle]
---
You are an expert code reviewer. Analyze code for:

- Code quality and best practices
- Potential bugs and edge cases
- Performance considerations
- Security vulnerabilities

Be thorough but concise. Provide actionable feedback.
```

### Frontmatter Options

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Short description shown in agent list |
| `model` | string | Model to use (e.g., `claude-3-opus`, `gpt-4`) |
| `temperature` | number | Temperature setting (0-1) |
| `tools` | array | Tools to enable for this agent |
| `mode` | `agent` / `subagent` | Top-level agent or delegated subagent (default: `subagent`) |
| `onlyFor` | array | Only visible to these parent agents |

### Crew Tools

| Tool | Description |
|------|-------------|
| `list_crew` | List all crew members |
| `get_crew` | Get a crew member's definition |
| `create_crew` | Add a new crew member |
| `edit_crew` | Edit a crew member |
| `delete_crew` | Remove a crew member |
| `reload_crew` | Reload crew from disk |

### How Crew Works

1. On plugin load, crew files are parsed from `crew/`, `agents/`, or `mates/` folders
2. Each crew member is converted to an AgentConfig
3. Crew is registered with OpenCode via the `config` hook
4. Agents become available for invocation via the Task tool

**Example**: Create a `frontend-expert` crew member, then delegate to it:
```
Task(agent="frontend-expert", prompt="Review this React component")
```

---

## Smart Features

### Auto-Suggestions (Automention)

Orders with `automention` enabled are suggested based on message content:

| Mode | Behavior |
|------|----------|
| `automention: true` | AI fetches and applies automatically if relevant |
| `automention: expanded` | Content injected directly (no fetch needed) |
| `automention: false` | No auto-suggestion |

### Tag Matching

Tags support groups, OR alternatives, and phrase matching:

```yaml
tags: [commit, [staged, changes], patchnote|patchlog]
```

| Tag Type | Example | Triggers When |
|----------|---------|---------------|
| **Single** | `commit` | Word present (needs >=2 singles) |
| **Group (AND)** | `[staged, changes]` | ALL words present (triggers immediately) |
| **OR** | `patchnote\|patchlog` | ANY word matches |

### Agent Spawn Injection

Orders can auto-inject when specific agents spawn:

```yaml
spawnAt: [frontend:expanded, oracle]
```

### Smart Deduplication

Repeated mentions become references:
- First `//linus-torvalds` -> full expansion
- Second `//linus-torvalds` -> `[use_workflow:linus-torvalds-abc1]`

### Nested Orders

Orders can reference other orders:

```yaml
orderInOrder: true
```

### Lazy Expansion (Hint Mode)

For large orders, use `expand: false` to reduce context bloat:

```yaml
---
expand: false
---
```

When `expand: false` is set:
- Instead of injecting full `<workflow>` content
- Injects a hint: `[//name → call get_workflow("name") to read]`
- AI fetches content on-demand when needed

**Global toggle**: Set `expandOrders: false` in `captain.json` to make all orders hint-only by default.

**Precedence**: Both `order.expand` AND `config.expandOrders` must be `true` for full expansion.

---

## Installation

Add to your `opencode.json`:

```json
{
  "plugin": ["opencode-captain"]
}
```

Or for local development:

```bash
cd ~/.config/opencode/plugin/opencode-captain
bun install
bun run build
```

## Configuration

Config file: `~/.config/opencode/captain.json`

```json
{
  "deduplicateSameMessage": true,
  "maxNestingDepth": 3,
  "expandOrders": true
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `deduplicateSameMessage` | boolean | `true` | Replace duplicate mentions with references |
| `maxNestingDepth` | number | `3` | Max depth for nested order expansion |
| `expandOrders` | boolean | `true` | Global toggle for order expansion (when `false`, all orders inject hints) |

---

## Migration from opencode-workflows

opencode-captain is fully backward compatible:

1. All existing workflow files work as-is
2. `workflows/` and `commands/` folders are still recognized
3. All workflow tools (`list_workflows`, etc.) continue to work
4. Simply rename the plugin in your `opencode.json`

**New capabilities:**
- Rules for silent constraint injection
- Crew for custom agent definitions
- Unified architecture

---

## License

MIT
