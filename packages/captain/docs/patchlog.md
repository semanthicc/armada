# Patchlog

## [1.6.0] - 2026-01-06

### Added
- **Captain Tool System**: Create custom TypeScript tools in workflow folders
  - Use `defineTool()` factory for type-safe tools with parameter validation
  - Or simple exports pattern for quick scripts
  - Tools auto-discovered from `scrolls/**/tools/*.ts`
- **Category-level tools**: Share tools across workflows in a category (e.g., `marketing/apollo`)
- **Workflow-specific tools**: Override with dedicated tools (e.g., `marketing/research/special`)
- `get_workflow` now lists available tools for that workflow
- Example workflow with tools in `scrolls/examples/`

### Changed
- Workflow names now include folder prefix (e.g., `marketing/research` instead of just `research`)
- `folder/index.md` workflows are now named `folder` (e.g., `//captain-manager` instead of `//captain-manager/index`)
- **Captain Manager**: Refactored `//captain-manager` to use the new `captain_tool` system
  - Added robust tools for creating/editing workflows (no more shell quoting issues)
  - `list`, `read`, `create`, `update`, `delete` tools available
  - **Tool Management**: Added `tool_create`, `tool_update`, `tool_list` etc. to manage custom tools via AI
  - Updated documentation to prefer tools over CLI for complex tasks

## [1.5.0] - 2026-01-05

### Added
- **Tool Policy System**: Fine-grained control over agent tools via `toolProfiles` (allowlist/blocklist, glob patterns like `serena_*`)
- **Captain CLI**: Native `captain` command for managing resources (workflows, rules, crews)
- **Spawn Context**: New `spawnWith` property for Crews to auto-inject workflow context
- **Bundled Workflows**: Support for built-in workflows (like `captain-manager`)

### Changed
- Improved automention hint format: now uses \`// name\` (with space) and inline descriptions
- Updated system prompts to prioritize the \`captain\` CLI for resource management

### Fixed
- Captain Manager workflow visibility in auto-suggestions

## [1.1.0] - 2025-12-28

### Added
- File inclusion support via `include` frontmatter field - reuse content from external files in workflows
- Cross-platform path resolution for include paths (Windows + Unix)
- New `include` parameter in `create_workflow` tool

### Changed
- Vocabulary update: "Orders" → "Scrolls" (backwards compatible)
  - `Order` → `Scroll`
  - `orderInOrder` → `scrollInScroll`  
  - `spawnAt` → `spawnFor`
- All legacy names still work via type aliases


## [1.0.5] - 2025-12-27

### Fixed
- Workflow auto-detection no longer triggers on partial word matches (e.g., "debug" tag won't match "debugger", "do" tag won't match "would")


## [1.0.4] - 2025-12-27

### Added
- **Sequence tag DSL** - match keywords in order with `a->b` syntax (e.g., `follow->instruction` triggers only when "follow" appears before "instruction")
- OR groups `(a|b)->c` and AND groups `a->[b,c]` in sequence tags
- 12 new tests for sequence tag parsing and matching

### Changed
- Auto-match hint header now shows `[Important. Workflow Detected]`
- Workflow name displayed in backticks for clarity


## [1.0.3] - 2025-12-27

### Added
- `expand` frontmatter option - set `expand: false` to inject hint instead of full content (AI fetches on-demand)
- `expandOrders` config option - global toggle for expansion behavior
- 7 new tests covering expand option scenarios

### Changed
- Hint format updated to `[// name]` for better readability
- Hint stripping now uses fingerprint-based detection (more robust recovery from corrupted hints)


## [1.0.2] - 2025-12-24

### Fixed
- Corrupted workflow hints now auto-recover - if user edits and breaks a hint, it's stripped and regenerated
- Idempotent message processing - multiple passes produce consistent output

### Added
- `sanitizeUserMessage()` - strips corrupted hints + highlight brackets before re-processing
- 24 new tests covering hint corruption scenarios


## [1.0.1] - 2025-12-24

### Added
- Trigger word highlighting - matched keywords wrapped in `[]` in your message (e.g., `[5 approaches]`)
- Adjacent keywords merge into single bracket for cleaner display
- Debug logging infrastructure (disabled by default, toggle in `debug-config.ts`)

### Changed
- Auto-match hint format improved: only header wrapped, workflow name as `//[name]`


## [1.0.0] - 2025-12-24

### Added
- **Captain rebrand** - 3-in-1 plugin: Workflows + Rules + Crew
- **Rules module** - Silent constraint injection via `.captain/rules/` markdown files
- **Crew module** - Define custom agents in `.captain/crew/` that auto-inject into specific agents
- Modular architecture: `core/`, `orders/`, `rules/`, `crew/` separation

### Changed
- Plugin renamed from `opencode-workflows` to `opencode-captain`
- All "workflow" terminology internally renamed to "order" (external API unchanged)
- Codebase restructured into pure logic modules (no I/O in engine files)

---

# Legacy opencode-workflows changelog (pre-rebrand)

## [1.5.0] - 2025-12-24

### Added
- Agent spawn injection via `spawnAt` field - auto-inject workflows when specific agents spawn
- Visibility filtering via `onlyFor` field - limit workflows to specific agents
- `automention: expanded` mode - inject workflow content directly without requiring fetch

### Changed
- Renamed `autoworkflow` → `automention` (backward compatible, legacy field still works)
- Renamed `agents` → `onlyFor` (backward compatible)
- Default `automention` is now `true` (previously `false`)

### Fixed
- Merge conflict resolution in system prompt hooks

## [1.4.2] - 2025-12-24

### Changed
- System prompt injection now uses `chat.params` hook as primary method (matching opencode-elf pattern)
- `experimental.chat.system.transform` kept as fallback for older OpenCode versions

### Refactored
- Extracted `buildWorkflowSystemPrompt()` helper to consolidate system prompt generation logic
- Reduced code duplication between hooks


## [1.4.1] - 2025-12-24

### Added
- Recursive workflow loading from subfolders - organize workflows in directories like `security/`, `review/`
- Filter parameters for `list_workflows`: filter by `tag`, `name`, `folder`, or `scope`
- Folder metadata displayed in `list_workflows` and `get_workflow` output

### Changed
- Autoworkflow hints now wrapped in `[]` brackets for better parsing by AI

### Fixed
- Copy/paste of workflow names from hints now works correctly (removed invisible zero-width space characters)


## [1.4.0] - 2025-12-24

### Added
- Auto-apply hints now show which words from your message triggered the match (e.g., `matched: "validate", "changes"`)
- Context-aware tokenizer prevents workflow mentions inside code blocks from being expanded
- Structured debug logging (enable with `WORKFLOW_DEBUG=1`)

### Fixed
- Nested workflow expansion now properly respects `workflowInWorkflow: false` setting
- Workflows inside `<workflow>` tags no longer get re-expanded on subsequent passes

### Changed
- Auto-apply hint format improved with clearer action guidance for AI


## [1.3.1] - 2025-12-24

### Fixed
- Nested workflows now generate unique IDs (previously workflows with same 2-char prefix produced duplicate IDs)
- Unicode workflow names fully supported (Cyrillic, Chinese, etc. no longer stripped)

### Changed
- ID generation uses djb2 hash algorithm instead of string slicing
- Workflow name patterns now use unicode property escapes (`\p{L}\p{N}`)


## [1.3.0] - 2025-12-23

### Added
- Nested workflow expansion via `workflowInWorkflow` frontmatter option (`true` | `hints` | `false`)
- Architecture documentation (`docs/architecture.md`)
- Testing utilities module for easier test authoring
- Regression test suite

### Changed
- Restructured codebase: split `core.ts` into `types.ts`, `engine.ts`, `storage.ts`
- Pure logic now isolated in `engine.ts` (no filesystem imports)
- All I/O operations consolidated in `storage.ts`
- `index.ts` reduced to plugin glue layer only

### Fixed
- Silent error swallowing replaced with proper error logging in config/workflow loading

### Removed
- Unused `svelte.config.js`


## [1.2.4] - 2025-12-23

### Added
- Tag groups syntax `[[word1, word2]]` for workflows - requires ALL words present to trigger (reduces false positives)
- 3-mode autoworkflow control: `true` (auto-apply), `hintForUser` (suggest only), `false` (disabled)
- Inline descriptions in auto-apply hints help AI decide workflow relevance
- `create_workflow` tool now accepts `description`, `tags`, and `autoworkflow` arguments

### Changed
- Workflow hints now show descriptions: `[Auto-apply workflows: //name — "description" — ...]`


## [1.2.3] - 2025-12-22

### Added
- Same-message workflow deduplication: first `//foo` expands, subsequent `//foo` becomes `[use_workflow:foo-id]`
- Configuration file `~/.config/opencode/workflows.json` with `deduplicateSameMessage` option
- Orphan reference recovery: AI can retrieve missing workflow content via `get_workflow` tool
- 23 new tests (109 total)

### Changed
- Reference tag renamed from `[workflow:...]` to `[use_workflow:...]` for clarity
- System prompt now instructs AI to use already-expanded workflow content directly

### Fixed
- Workflow refs cleaned up when message is deleted/canceled (no more stale references)
- Removed `@ts-ignore` anti-patterns, added proper `PluginEvent` typing


## [1.2.2] - 2025-12-22

### Added
- Positional argument support: `//review(src/index.ts)` → `{{args._}}`
- Quoted positional args: `//review("path with spaces.ts")`
- 94 unit tests (up from 85)

### Changed
- Single value without `key=` is now treated as the default positional arg `_`
- Named args still work: `//review(file=src/index.ts)` → `{{args.file}}`


## [1.2.1] - 2025-12-22

### Added
- Workflow variables: `{{TODAY}}`, `{{NOW}}`, `{{PROJECT}}`, `{{BRANCH}}`, `{{USER}}`
- Workflow parameters: `//workflow(key=value)` syntax with `{{args.key}}` expansion
- Support for quoted values in parameters: `//review(file="path with spaces.ts")`
- 85 unit tests (up from 61)

### Changed
- Variable expansion happens automatically before workflow injection
- DISTINCTION RULE now forbids raw file access to workflow directory
- `//patchlog` workflow now uses `{{TODAY}}` for automatic date

### Fixed
- Date placeholder in patchlog entries now auto-populated


## [1.2.0] - 2025-12-22

### Added
- Canonical workflow lookup: `//5approaches` now auto-executes `5-approaches`
- Case-insensitive matching: `//CommitReview` expands `commit_review`
- Delimiter-agnostic matching: `//commitreview` expands `commit_review`
- Force re-injection syntax: `//workflow!` re-expands even if already used in session
- Session-aware workflow tracking: repeated mentions show compact `[workflow:name-id]` reference
- 61 unit tests for core matching and parsing functions

### Changed
- Extract pure functions to `core.ts` for better testability
- Consolidate multiple toast notifications into single multi-line message
- Suggestions now show multiple matches with aliases (e.g., `cr → commit_review (cr) | create`)

### Fixed
- Multiple workflows expanding only showed one in toast notification
- Toast race condition causing notifications to overwrite each other


## [1.1.2] - 2025-12-22

### Changed
- "Did you mean?" suggestions now show as TUI toast directly to user
- Remove `<workflows-context>` block entirely - all feedback via toasts

### Removed  
- `buildWorkflowContext` function - no longer needed


## [1.1.1] - 2025-12-22

### Changed
- Remove redundant `<workflows-context>` output on successful expansion (the `<workflow>` tags already contain all needed info)

### Fixed
- Cleaner chat output - only show context block for errors and "Did you mean?" suggestions


## [1.1.0] - 2025-12-22

### Added
- Workflow metadata support: `tags`, `agents`, `description`, `autoworkflow` in frontmatter
- Compressed workflow catalog injected into AI system prompt for discovery
- Auto-suggestions for relevant workflows based on topic matching
- TUI toast notifications for workflow expansion feedback
- Alias visibility in workflow catalog and `list_workflows` output

### Changed
- Migrate to dedicated OpenCode hook API (`chat.message`, `experimental.chat.system.transform`)
- Cleaner `<workflows-context>` output (removed redundant instructions)
- Discovery now matches against workflow name, aliases, tags, and description

### Fixed
- Console.log pollution replaced with clean TUI toasts


## [1.0.0] - 2025-12-21

### Added
- Inline workflow mentions via `//workflow-name` syntax in prompts
- Auto-expansion of workflow templates with `<workflow>` XML tags
- Smart "Did you mean?" suggestions for partial or incorrect workflow names
- YAML frontmatter support for workflow shortcuts/aliases
- Project-scoped (`.opencode/workflows/`) and global (`~/.config/opencode/workflows/`) workflow directories
- CRUD tools: `create_workflow`, `edit_workflow`, `delete_workflow`, `rename_workflow`, `list_workflows`, `get_workflow`, `reload_workflows`, `expand_workflows`
