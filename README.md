# opencode-workflows

Inline workflow mentions for OpenCode - use `//workflow-name` anywhere in your prompts!

## What is this?

This plugin enables you to reference workflow templates inline in your messages using `//workflow-name` syntax. Instead of repeating long instructions, just mention a workflow and the AI will expand it automatically.

## Usage

Simply use `//workflow-name` anywhere in your message:

```
Review this auth system like //linus-torvalds and think about it //5-approaches

@backend/auth/service.go
```

The plugin automatically:
1. Detects the `//linus-torvalds` and `//5-approaches` mentions
2. Expands them into full workflow content wrapped in `<workflow>` tags
3. Injects instructions for the AI to apply all workflows

## Naming Rules

| Format | Example | Valid? |
|--------|---------|--------|
| Hyphens | `//my-workflow` | Yes |
| Numbers | `//5-approaches` | Yes |
| Underscores | `//my_workflow` | Yes |
| CamelCase | `//MyWorkflow` | Yes |
| Unicode | `//проверка-кода` | Yes |
| Unicode | `//代码审查` | Yes |
| **Spaces** | `//my workflow` | **No** - stops at space |

**Important**: Spaces break the tag. `//5 approaches` captures only `//5`.

## Smart Auto-Suggestions

Workflows with `autoworkflow` enabled can be automatically suggested based on your message content.

### Autoworkflow Modes

| Mode | YAML Value | Behavior |
|------|------------|----------|
| **Auto-apply** | `autoworkflow: true` | AI fetches and applies the workflow automatically if relevant |
| **User decides** | `autoworkflow: hintForUser` | AI shows a suggestion, user decides whether to use it |
| **Disabled** | `autoworkflow: false` | No auto-suggestion (default) |

### Example

If you have a workflow with:
```yaml
---
autoworkflow: true
description: "Security audit using OWASP Top 10"
tags: [security, audit, vulnerability]
---
```

And you type: "Can you check this code for security issues?"

The plugin detects the matching tags and appends:
```
[⚡ Workflow matched.
ACTION_REQUIRED: IF matches user intent → get_workflow("name"), else SKIP
↳ // security-audit (matched: "security", "check")
↳ Desc: "Security audit using OWASP Top 10"]
```

The AI will automatically fetch and apply the workflow.

For `autoworkflow: hintForUser`, the hint appears as:
```
[Suggested workflows: // security-audit — "Security audit using OWASP Top 10"]
```

And the AI will suggest it to you without auto-applying.

## Smart Suggestions ("Did you mean?")

If you type a partial or incorrect workflow name, the plugin suggests the correct one:

```
You: analyze this //5 approaches
AI: I noticed you typed "//5". Did you mean "//5-approaches"?
```

The plugin matches:
- **Prefix**: `//5` → `//5-approaches`
- **Partial**: `//torvalds` → `//linus-torvalds`

## Available Workflows

| Workflow | Description |
|----------|-------------|
| `//5-approaches` | Analyze from 5 perspectives: first principles, inversion, analogies, blue sky, MVP |
| `//inspect` | Inspect staged changes before commit - full review pipeline |
| `//linus-torvalds` | Kernel maintainer code review style - direct, focused on data structures, KISS |
| `//patchlog` | Generate structured patchlog entry for documentation |
| `//security-audit` | OWASP Top 10 security review checklist |

## Creating Custom Workflows

### Using the Tool (Recommended)

Use the `create_workflow` tool - the AI will ask you for:
1. Global or project scope?
2. Shortcuts/aliases?
3. Description?
4. Tags for auto-suggestion?
5. Autoworkflow mode?

### Manual Creation

Create `.md` files in one of these locations:

| Location | Scope | Priority |
|----------|-------|----------|
| `.opencode/workflows/` | Project-specific | Highest |
| `~/.config/opencode/workflows/` | Global | Lower |

Project workflows override global ones with the same name.

### Organizing with Subfolders

Workflows can be organized into subfolders for better organization:

```
~/.config/opencode/workflows/
├── security/
│   ├── audit.md          → //audit
│   └── vulnerability.md  → //vulnerability
├── review/
│   ├── code-review.md    → //code-review
│   └── pr-review.md      → //pr-review
└── general.md            → //general
```

**Key points:**
- Subfolder structure is for organization only - workflow names remain unique
- Use `list_workflows` with `folder` filter to find workflows in specific folders
- Workflows in subfolders show their folder path in listings

### Workflow File Format

The filename becomes the workflow name:

**`~/.config/opencode/workflows/my-workflow.md`** → `//my-workflow`

```markdown
---
description: "Short description of what this workflow does"
shortcuts: [mw, my-wf]
tags: [review, check, analyze]
autoworkflow: true
---
# My Custom Workflow

Instructions for the AI to follow when this workflow is mentioned.

## Step 1
Do this thing...

## Step 2
Then do this...
```

### Frontmatter Options

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Short description shown in catalog |
| `shortcuts` / `aliases` | array | Alternative names to trigger this workflow |
| `tags` | array | Keywords for auto-suggestion matching (supports tag groups) |
| `autoworkflow` | `true` / `hintForUser` / `false` | Auto-suggestion mode (default: `false`) |
| `workflowInWorkflow` | `true` / `hints` / `false` | Nested workflow expansion mode (default: `false`) |
| `agents` | array | Limit auto-suggestion to specific agents |

### Tag Groups (Smart Matching)

Tags support **groups**, **OR alternatives**, and **phrase matching** for precise matching:

```yaml
tags: [commit, [staged, changes], patchnote|patchlog, [check my, commit]]
```

| Tag Type | Example | Triggers When |
|----------|---------|---------------|
| **Single** | `commit` | Word present (needs ≥2 singles to trigger) |
| **Group (AND)** | `[staged, changes]` | ALL words in group present (triggers immediately) |
| **OR** | `patchnote\|patchlog` | ANY word matches (counts as 1 single match) |
| **Phrase** | `[check my, commit]` | Phrase "check my" as substring + "commit" present |

**Phrase Matching:**
Spaces inside group items create **exact phrase matches**. The phrase must appear as a substring in that exact order:
- `[review my, changes]` → matches "can you review my changes" ✓
- `[review my, changes]` → does NOT match "my review of changes" ✗ (wrong order)

**Matching Rules:**
- A **group match** (all items present) triggers the workflow immediately
- **Single tags** need ≥2 matches to trigger
- **OR tags** count as ONE single match if any alternative matches
- **Phrases** match as literal substrings (order matters!)
- Matching **workflow name**, **alias**, or **description** also triggers

**Examples:**

| User Message | Matches | Triggers? |
|--------------|---------|-----------|
| "check my staged changes" | Group `[staged, changes]` ✓ | ✅ YES |
| "commit this code" | Single `commit` only | ❌ NO (only 1 single) |
| "commit and review" | Singles `commit` + `review` | ✅ YES (2 singles) |
| "generate patchlog" | OR `patchnote\|patchlog` (1 match) | ❌ NO (only 1 single) |
| "patchlog for commit" | OR `patchnote\|patchlog` + `commit` | ✅ YES (2 singles) |
| "check my commit" | Phrase `check my` + `commit` ✓ | ✅ YES |
| "my check commit" | Phrase `check my` ✗ (wrong order) | ❌ NO |

### Shortcuts / Aliases

You can define multiple names for the same workflow:

```markdown
---
shortcuts: [cr, review_commit, commit-review]
---
# Commit Review Workflow
```

Now `//cr`, `//review_commit`, and `//commit-review` all trigger the same workflow.

## Tools Provided

| Tool | Description |
|------|-------------|
| `list_workflows` | List all available workflows (supports filters) |
| `get_workflow` | Get a specific workflow's content |
| `create_workflow` | Create a new workflow with proper frontmatter |
| `edit_workflow` | Edit an existing workflow |
| `rename_workflow` | Rename a workflow |
| `delete_workflow` | Delete a workflow |
| `reload_workflows` | Reload workflows from disk |
| `expand_workflows` | Manually expand `//mentions` in text |

### list_workflows Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `tag` | No | Filter by tag (substring match) |
| `name` | No | Filter by name (substring match) |
| `folder` | No | Filter by folder (substring match) |
| `scope` | No | Filter by scope (`global` or `project`) |

**Examples:**
- `list_workflows(folder="security")` - list workflows in `security/` subfolder
- `list_workflows(tag="review")` - list workflows with "review" tag
- `list_workflows(scope="project")` - list only project-specific workflows

### create_workflow Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `name` | Yes | Workflow name (without `//` prefix) |
| `content` | Yes | Markdown content (frontmatter added automatically) |
| `scope` | No | `global` or `project` (default: `global`) |
| `shortcuts` | No | Comma-separated aliases, e.g., `"cr, review"` |
| `description` | No | Short description of the workflow |
| `tags` | No | Comma-separated tags for auto-suggestion |
| `autoworkflow` | No | `true` / `hintForUser` / `false` (default: `false`) |

## How It Works

1. **Startup**: Plugin loads all `.md` files from workflow directories
2. **Detection**: When you send a message, the plugin scans for `//pattern` mentions
3. **Expansion**: Valid mentions are replaced with full workflow content in `<workflow>` tags
4. **Auto-suggestion**: If no explicit mentions, checks for matching autoworkflows based on tags/description
5. **Deduplication**: Repeated mentions in the same message become `[use_workflow:name-id]` references
6. **Session Tracking**: Workflows used in previous messages are referenced, not re-expanded
7. **Suggestions**: Invalid mentions trigger "Did you mean?" suggestions

### Smart Deduplication

When you mention the same workflow multiple times in one message:

```
Analyze this //linus-torvalds style, then apply //linus-torvalds to refactor
```

The plugin expands the **first** mention fully and converts subsequent mentions to references:
- First `//linus-torvalds` → `<workflow name="linus-torvalds">...</workflow>`
- Second `//linus-torvalds` → `[use_workflow:linus-torvalds-abc1]`

This prevents context bloat while maintaining workflow availability.

### Nested Workflows

Workflows can reference other workflows using the same `//workflow-name` syntax.

Control nested expansion with `workflowInWorkflow` in frontmatter:

| Mode | YAML Value | Behavior |
|------|------------|----------|
| **Disabled** | `workflowInWorkflow: false` | Nested mentions stay as `//name` (default) |
| **Enabled** | `workflowInWorkflow: true` | Nested mentions are fully expanded |
| **Hints** | `workflowInWorkflow: hints` | Shows hint about available nested workflows |

**Example:**
```markdown
---
workflowInWorkflow: true
---
# Parent Workflow

First, apply //5-approaches to analyze the problem.
Then use //linus-torvalds review style.
```

When `workflowInWorkflow: true`, nested `//5-approaches` and `//linus-torvalds` are expanded inline.

**Safety limits:**
- Max nesting depth: 3 (configurable via `maxNestingDepth` in config)
- Circular references are detected and prevented

### Pattern Matching

The workflow mention pattern ensures:
- URLs like `https://example.com` are ignored
- File paths like `/usr/local//bin` are ignored  
- Comments like `// This is a comment` are ignored (space breaks token)
- Unicode workflow names are fully supported (Cyrillic, Chinese, etc.)
- Only valid workflow tokens are captured

## Installation

Add to your `opencode.json`:

```json
{
  "plugin": ["opencode-workflows"]
}
```

Or for local development:

```bash
cd ~/.config/opencode/plugin/opencode-workflows
bun install
bun run build
```

## Configuration

The plugin creates a configuration file at `~/.config/opencode/workflows.json` on first run:

```json
{
  "deduplicateSameMessage": true,
  "maxNestingDepth": 3
}
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `deduplicateSameMessage` | `true` | When enabled, repeated workflow mentions in the same message become references (`[use_workflow:...]`) instead of full expansions. Set to `false` to always expand all mentions. |
| `maxNestingDepth` | `3` | Maximum depth for nested workflow expansion. Prevents runaway recursion. |

## License

MIT
