# Patchlog

All notable changes to opencode-semanthicc.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

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
| 0.1.0 | MVP-1: Heuristics | ✅ Complete |
| 0.2.0 | MVP-2: Semantic code search (MiniLM embeddings) | ✅ Complete |
| 0.3.0 | MVP-3: Knowledge evolution (supersede/archive) | ✅ Complete |
| 0.4.0 | MVP-4: Context/DI architecture + Passive learning infra | ✅ Complete |
| 1.0.0 | Full release: All MVPs integrated | 🔲 Planned |
