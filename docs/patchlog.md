# Patchlog

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
