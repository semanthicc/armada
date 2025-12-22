# Patchlog

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

## [1.0.0] - 2025-12-21

### Added
- Inline workflow mentions via `//workflow-name` syntax in prompts
- Auto-expansion of workflow templates with `<workflow>` XML tags
- Smart "Did you mean?" suggestions for partial or incorrect workflow names
- YAML frontmatter support for workflow shortcuts/aliases
- Project-scoped (`.opencode/workflows/`) and global (`~/.config/opencode/workflows/`) workflow directories
- CRUD tools: `create_workflow`, `edit_workflow`, `delete_workflow`, `rename_workflow`, `list_workflows`, `get_workflow`, `reload_workflows`, `expand_workflows`

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
