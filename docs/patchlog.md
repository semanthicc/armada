# Patchlog

All notable changes to opencode-semanthicc.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [0.4.0] - 2026-01-04

### Added
- **Context/DI Architecture**: All database operations now support dependency injection via `SemanthiccContext`
- **Test Harness**: `createTestContext()` provides perfect test isolation with in-memory SQLite
- **Passive Learning**: Automatic tool failure capture via `tool.execute.after` hook
- **Error Detection**: `isToolError()` heuristics for detecting errors in tool output
- `failure-fixed` action: Mark captured failures as resolved

### Changed
- All modules (repository, project-detect, similarity, indexer, search) refactored to context-first pattern
- Backward-compatible: Legacy singleton pattern still works for production
- `getDb()` now preserves current DB connection when called without args (prevents test→production DB switch)
- Plugin now initializes per-session passive learners for failure tracking

### Fixed
- **Critical**: DB singleton was switching from test DB to production DB mid-test
- Test pollution: Tests now fully isolated with `clearTables()` helper

### Technical
- New files: `src/context.ts`, `src/db/test-utils.ts`, `src/hooks/error-detect.ts`
- New modules: `src/hooks/keywords.ts`, `src/hooks/similarity.ts`, `src/hooks/passive-learner.ts`
- 138 passing tests (up from 102)
- Schema migration: `keywords TEXT` column for failure matching
- Plugin hook: `tool.execute.after` wired for passive learning

---

## [0.3.0] - 2026-01-03

### Added
- **Knowledge Evolution**: Memories can now evolve over time with full history tracking
- `supersede` action: Replace outdated memories with evolved versions while preserving history chain
- `getMemoryChain()`: Traverse full evolution history of any memory
- **History Intent Detection**: Auto-detects when user wants history (e.g., "why is it like this?")
- `includeHistory` flag for explicit history queries

### Changed
- Default queries return only `current` status memories
- List action shows `[superseded]` status badge for historical memories
- Schema now supports `supersede` as a memory source

### Technical
- `supersedeMemory(oldId, newContent)` links old→new with proper status updates
- `detectHistoryIntent()` uses 12 regex patterns for 100% accuracy on test set
- 33 new tests (102 total), all passing

---

## [0.2.1] - 2026-01-03

### Added
- **Auto-detect git root**: Plugin now automatically finds and registers projects from any subdirectory
- No manual `register` action needed — heuristics work immediately when inside a git repo

### Changed
- All hooks and tool actions use `getOrCreateProject()` for seamless project detection
- Clearer error messages: "Not in a git repository" instead of "Project not registered"

### Technical
- `findGitRoot(cwd)` walks up directories looking for `.git`
- `getOrCreateProject(cwd)` auto-registers using folder name as project name
- 12 new tests (69 total), all passing

---

## [0.2.0] - 2026-01-02

### Added
- **Semantic code search**: Find code by meaning using MiniLM-L6-v2 embeddings (384 dims)
- **Project indexing**: Walk project files, chunk code, generate embeddings
- **Tool actions**: `search`, `index`, `status`, `remember`, `forget`, `list`
- **File exclusions**: Smart filtering of node_modules, .git, binaries, lock files
- **Similarity ranking**: Cosine similarity with top-K result selection

### Technical
- `@xenova/transformers` for ONNX-based MiniLM inference
- Embeddings stored as BLOB in SQLite with project isolation
- 55 passing tests, 1.42MB bundle (includes ONNX runtime)
- New spec: `specs/semantic-search.md`

---

## [0.1.0] - 2026-01-02

### Added
- **Heuristics system**: Auto-inject learned patterns into every AI conversation
- **Confidence tracking**: Validate (+0.05) / Violate (-0.10) operations
- **Time decay**: 30-day half-life for unused patterns (golden rules exempt)
- **Golden rule promotion**: High-confidence patterns become permanent
- **Project scoping**: Project-specific + global heuristics support
- **OpenCode plugin**: `experimental.chat.system.transform` hook integration

### Technical
- SQLite schema with unified `memories` table (bun:sqlite, zero external deps)
- 25 passing tests, 8.9KB bundle size
- Architecture specs: `specs/schema.md`, `specs/heuristics.md`, `specs/plugin.md`

---

## Roadmap

| Version | Milestone | Status |
|---------|-----------|--------|
| 0.1.0 | MVP-1: Heuristics | ✅ Complete |
| 0.2.0 | MVP-2: Semantic code search (MiniLM embeddings) | ✅ Complete |
| 0.3.0 | MVP-3: Knowledge evolution (supersede/archive) | ✅ Complete |
| 0.4.0 | MVP-4: Context/DI architecture + Passive learning infra | ✅ Complete |
| 1.0.0 | Full release: All MVPs integrated | 🔲 Planned |
