# Patchlog

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
