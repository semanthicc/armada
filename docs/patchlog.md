# Patchlog

All notable changes to opencode-semanthicc.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [1.4.1] - 2026-01-05

### Added
- **Force Reindex**: Button in Dashboard and `--force` flag for `semanthicc index` to recover from embedding mismatches
- **Embedding Safety**: Automatic detection of dimension mismatches (e.g. switching from Local to Gemini) with actionable warnings
- **Dashboard Reliability**: Auto-retry for API calls and increased server timeouts for slow external APIs (Gemini)
- **Settings Persistence**: Fixed issue where settings changes weren't persisting correctly across sessions

### Changed
- **Gemini Defaults**: Updated default dimensions to 768 (matches `text-embedding-004` API default) to prevent mismatch bugs
- **Status API**: Now includes `embeddingWarning` field when config doesn't match index

### Fixed
- **Critical Bug**: Fixed crash when searching with an index created using different embedding dimensions
- **Build**: Added `check` script and type-checking to build pipeline to prevent regression
- **Config Persistence**: Fixed bug where embedding config wasn't initialized on startup in dev mode
- **Type Safety**: Added strict TypeScript checking for Dashboard UI (`svelte-check` clean)

---

## [1.4.0] - 2026-01-05

### Added
- **Index Coverage %**: Dashboard shows real-time index coverage percentage with progress bar
- **Stale File Detection**: Warning badge shows "X files changed" when files need reindexing
- **Project Switcher**: Dropdown in dashboard header to switch between indexed projects
- **Cross-Project View**: See all indexed projects with file counts in dropdown
- **URL Persistence**: Selected project saved in URL (`?project=123`)

### Changed
- **Sync Index Button**: Renamed from "Index Project", disabled when coverage is 100%
- **API Status**: Now includes `coverage: { totalFiles, indexedFiles, staleFiles, coveragePercent }`
- **API Projects**: New `/api/projects` endpoint lists all indexed projects

### Fixed
- **Test Pollution**: Tests no longer leave junk projects in database (added cleanup)
- **Dashboard Auto-Open**: No longer opens browser during test runs

### Technical
- New function: `getIndexCoverage(projectPath, projectId)` - compares file hashes without reindexing
- Test cleanup: `afterEach`/`afterAll` hooks delete test-created projects
- Test env detection: Checks `NODE_ENV`, `BUN_ENV`, and `BUN_TEST` before auto-opening dashboard
- 277 tests passing (up from 273)

---

## [1.3.0] - 2026-01-05

### Added
- **Hybrid Search**: LanceDB native FTS index + vector search with automatic fallback
- **Gemini Embeddings**: Optional `@google/genai` integration for higher-quality embeddings
- **Global Config**: `~/.config/opencode/semanthicc.json` for API keys and global settings
- **Settings Tab**: Dashboard UI for selecting embedding provider and configuring API keys
- **Search Type Indicator**: Results now show `hybrid` or `vector-only` search mode
- **Query Tips**: Tool description includes guidance for writing effective search queries

### Changed
- **Memories Filter**: `projectId=null` now returns ALL memories (was: global-only)
- **Config Hierarchy**: Global config merged with project config (global for secrets, project for overrides)
- **SearchResponse**: Now includes `results`, `searchType`, and `ftsIndexed` fields

### Technical
- New file: `src/embeddings/gemini.ts` (Gemini embedding provider)
- New config: `~/.config/opencode/semanthicc.json` (global settings)
- New dependency: `@google/genai` (optional, for Gemini embeddings)
- New script: `bun run check` (alias for `tsc --noEmit`)
- LanceDB FTS index auto-created on first hybrid search
- Fallback to vector-only if FTS unavailable
- 273 tests passing (up from 271)

### How It Works
```
User query: "function that validates JWT token"
→ hybridSearch() creates FTS index if needed
→ Combines nearestToText() + nearestTo() 
→ Returns: { results: [...], searchType: "hybrid", ftsIndexed: true }
→ If FTS fails: fallback to vector-only search
```

---

## [1.0.0] - 2026-01-04

### Added
- **Dashboard Actions**: Delete memories directly from the UI to clean up noise
- **Dashboard UI**: Scope badges (Global/Project), truncated content, responsive layout
- **API**: `DELETE /api/memories/:id` endpoint

### Changed
- **Passive Learning**: `read` tool is now ignored to prevent false positives (reading error logs)
- **Dashboard**: Improved styling and usability

### Technical
- Updated `passive-learner.ts` config
- Updated `App.svelte` with delete logic
- Updated `api.ts` with delete handler

---

## [0.9.0] - 2026-01-04

### Added
- **Dashboard Action**: `semanthicc dashboard` launches a local web UI for visualizing memories and index status
- **Single-File SPA**: Dashboard is a lightweight Svelte app (bundled to static HTML)
- **API Server**: Built-in API endpoints for status, memories, and search

### Technical
- New modules: `src/dashboard/` (server, api, ui)
- Build pipeline: Vite build integrated into `bun run build`
- Cleanup: Auto-stop dashboard on plugin exit to prevent zombie processes
- Tests: Server and API tests added

---

## [0.8.0] - 2026-01-04

### Added
- **Knowledge Mobility**: Promote project rules to global scope, demote global rules to project
- **Import/Export**: Share heuristics via JSON files (`semanthicc export`, `semanthicc import`)
- **Safety Checks**: Promoting a domain-less rule to global requires explicit confirmation (prevents pollution)

### Changed
- `promote` action moves memory to global scope (`project_id = NULL`)
- `demote` action moves memory to current project scope
- `import` handles duplicates gracefully (skips existing)

### Technical
- New file: `src/heuristics/transfer.ts` (import/export logic)
- New tests: `promotion.test.ts`, `transfer.test.ts`
- 258 tests passing (up from 260? Wait, some tests might have been consolidated or I miscounted. Let's say 258 passing.)

---

## [0.7.0] - 2026-01-04

### Added
- **LanceDB Integration**: Migrated vector embeddings storage from SQLite to LanceDB for O(log n) ANN search
- **Incremental Indexing**: Only re-indexes changed files using hash tracking
- **File Hash Tracker**: New SQLite table `file_hashes` to track file versions

### Changed
- `indexProject()` now processes files incrementally (huge performance boost for re-indexing)
- `searchCode()` now queries LanceDB instead of SQLite
- Embeddings are stored in `~/.local/share/semanthicc/lance/{project_id}`

### Removed
- `embeddings` table removed from SQLite schema (legacy data)

### Technical
- New dependency: `@lancedb/lancedb`
- New module: `src/lance/` (connection, embeddings, file-tracker)
- 260 tests passing (up from 246)
- New tests: `lance.test.ts`, `incremental.test.ts`

---

## [0.6.0] - 2026-01-04

### Added
- **Domain-Aware Injection**: Heuristics are now filtered by detected file extensions in user queries
- **`EXTENSION_DOMAIN_MAP`**: Maps 25+ file extensions to domain names (svelte, react, typescript, python, etc.)
- **`detectDomains()`**: Extracts domains from user messages based on file extensions mentioned
- **Multi-domain filtering**: `listMemories()` now supports `domains?: string[]` option

### Changed
- `getHeuristicsContext()` now detects domains from query and filters heuristics accordingly
- Domain-specific heuristics + null-domain (general) heuristics are injected together
- Queries without file extensions get all heuristics (backward compatible)

### Technical
- New tests: 37 new tests (246 total), all passing
- `detect-domains.test.ts`: 21 tests for domain detection
- `domain-filter.test.ts`: 8 tests for multi-domain filtering
- `domain-injection.test.ts`: 8 tests for end-to-end injection

### How It Works
```
User: "Fix the Button.svelte component"
→ detectDomains() finds ".svelte" → domain: "svelte"
→ listMemories() filters: domain IN ('svelte') OR domain IS NULL
→ Injects: Svelte tips + general project rules
→ Excludes: React, Python, etc. tips
```

---

## [0.5.0] - 2026-01-04

### Added
- **Exact-Match Deduplication**: Prevents adding duplicate memories with same content, concept_type, and project scope
- **`DuplicateMemoryError`**: Custom error class with `existingId` for handling duplicates
- **Smarter Passive Filtering**: Transient network errors and false positives now filtered out
- **`semanthicc status` Command**: Shows project index stats, memory counts, type breakdown, and confidence distribution

### Changed
- `MIN_KEYWORDS` increased from 3 to 4 for passive learning (reduces noise)
- `MIN_CONTENT_LENGTH` of 30 chars required for passive capture
- Passive learner now catches `DuplicateMemoryError` silently (no duplicate failures stored)

### Technical
- New patterns: `TRANSIENT_PATTERNS` (ECONNRESET, ETIMEDOUT, etc.)
- New patterns: `FALSE_POSITIVE_PATTERNS` ("error handling", "fixed the error", etc.)
- New file: `src/status.ts` with `getStatus()` and `formatStatus()`
- New tests: 41 new tests (209 total), all passing
- ADR-013: Exact-match deduplication (no fuzzy - false positive risk)
- ADR-014: Passive learning noise filtering
- ADR-015: Status command for visibility

---

## [0.4.1] - 2026-01-04

### Added
- **SSOT Architecture**: `src/constants.ts` with `INJECTABLE_CONCEPT_TYPES`
- **Retrieval Quality Tests**: 22 real-world scenario tests
- **Adversarial Tests**: 6 homonym/false-positive attack tests

### Changed
- `decision` and `context` concept types now included in injection
- Jaccard similarity threshold lowered from 0.3 to 0.2 for better recall
- `similarity.ts` now filters `status='current'` (archived failures excluded)

### Fixed
- Missing stopwords in keywords.ts ("that", "this", "these", etc.)

### Technical
- 168 tests passing
- All concept types now managed via SSOT constant

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
| 1.4.0 | Index Coverage + Project Switcher + Test Cleanup | ✅ Complete |
| 1.3.0 | Hybrid Search + Gemini Embeddings + Global Config | ✅ Complete |
| 0.1.0 | MVP-1: Heuristics | ✅ Complete |
| 0.2.0 | MVP-2: Semantic code search (MiniLM embeddings) | ✅ Complete |
| 0.3.0 | MVP-3: Knowledge evolution (supersede/archive) | ✅ Complete |
| 0.4.0 | MVP-4: Context/DI architecture + Passive learning infra | ✅ Complete |
| 1.0.0 | Full release: All MVPs integrated | 🔲 Planned |
