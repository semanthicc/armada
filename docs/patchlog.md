# Patchlog

All notable changes to opencode-semanthicc.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

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
| 0.3.0 | MVP-3: Knowledge evolution (supersede/archive) | 🔲 Planned |
| 0.4.0 | MVP-4: Passive learning (tool outcome capture) | 🔲 Planned |
| 1.0.0 | Full release: All MVPs integrated | 🔲 Planned |
