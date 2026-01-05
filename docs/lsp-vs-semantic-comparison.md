# LSP vs Semantic Search: Test Results & Comparison

## Executive Summary

After implementing edge case testing and embedding dimension mismatch fixes, here are the findings:

---

## Test Results

### Test 1: Synonym Search (login → authenticate)

| Tool | Query | Result | Verdict |
|------|-------|--------|---------|
| **LSP** `find_symbol("login")` | No results | ❌ Can't search concepts |
| **LSP** `find_symbol("auth", substring=true)` | Only test file | ⚠️ Literal only |
| **Semantic** `search("login authentication user sign in")` | Found docs, test files, edge-cases doc | ⚠️ **Works but prioritizes docs** |

**Finding**: Semantic search works for conceptual queries but docs/tests often outrank code in test-heavy repos.

---

### Test 2: Exact Symbol Lookup

| Tool | Query | Result | Verdict |
|------|-------|--------|---------|
| **LSP** `find_symbol("saveEmbeddingConfig")` | Exact location | ✅ **Superior** |
| **Semantic** `search("saveEmbeddingConfig")` | Test files, docs | ❌ Poor for exact symbols |

**Finding**: For known symbol names, LSP is superior - precise, fast, no noise.

---

### Test 3: Partial Name Match

| Tool | Query | Result | Verdict |
|------|-------|--------|---------|
| **LSP** `find_symbol("get", substring=true)` | 80+ symbols (all code + tests + built assets) | ⚠️ **Comprehensive but noisy** |
| **Semantic** `search("get user function database")` | Mixed: src/db, src/config | ⚠️ **Conceptual, less noisy** |

**Finding**: LSP returns everything with "get" substring including build artifacts. Semantic is more selective.

---

### Test 4: Technical/Coding Queries

| Tool | Query | Result | Verdict |
|------|-------|--------|---------|
| **Semantic** `search("function that saves embedding config")` | Found `updateProjectEmbeddingConfig` in config.ts | ✅ **Works** |
| **Semantic** `search("lancedb table schema connection")` | Found `connection.ts` | ✅ **Works** |
| **Semantic** `search("handle embedding dimension mismatch error")` | Found error message in config-store.ts | ✅ **Works** |

**Finding**: Semantic search **excels at technical/coding queries** - understands intent better than keyword matching.

---

### Test 5: Cross-Reference ("where is X used")

| Tool | Query | Result | Verdict |
|------|-------|--------|---------|
| **LSP** `find_referencing_symbols("saveEmbeddingConfig")` | 8 locations (tests + index.ts) | ✅ **Complete, accurate** |
| **Semantic** `search("where is saveEmbeddingConfig used or called")` | Test files + config.ts | ⚠️ **Works but less precise** |

**Finding**: LSP wins for reference finding - returns ALL usages with context.


---

## When to Use Which?

| Use Case | Recommended Tool | Why |
|-----------|------------------|------|
| **Find symbol by name** | LSP `find_symbol` | Exact, fast, reliable |
| **Find where X is used** | LSP `find_referencing_symbols` | Complete, accurate |
| **Understand how authentication works** | Semantic `searchCode` | Conceptual understanding |
| **Find TODO comments** | Semantic | LSP ignores comments |
| **Navigate large codebase** | LSP | Symbol hierarchy, relationships |
| **"What function does X?"** | Semantic | Matches intent, not name |

---

## Critical Edge Case: Embedding Dimension Mismatch ✅ FIXED

**Problem**: User indexed with Provider A (384 dims), switched to Provider B (768 dims), search failed with cryptic error.

**Solution implemented**:
1. `embedding_config` table stores metadata per project
2. `validateEmbeddingConfig()` checks before search
3. `EmbeddingConfigMismatchError` with helpful message
4. UI shows warning + "Force Reindex" button
5. Dashboard API returns `embeddingWarning` in status response

**Status**: ✅ **COMPLETE** - Users get clear guidance on what to do.

---

## Code Chunks & AST Chunking Decision

**Recommendation**: **DEFER to v1.6.0** (see [edge-cases-testing.md](./edge-cases-testing.md))

Rationale:
- LSP already covers structured symbol navigation
- Semantic search's value is conceptual, not precise
- Token chunking + overlap captures 90% of context needs
- AST chunking adds complexity with marginal benefit

---

## Final Comparison Matrix

| Metric | LSP (Serena) | Semantic (Semanthicc) | Winner |
|---------|----------------|---------------------|--------|
| **Exact symbol lookup** | ⭐⭐⭐⭐⭐ | ⭐⭐ | **LSP** |
| **Find references** | ⭐⭐⭐⭐⭐ | ⭐ | **LSP** |
| **Conceptual search** | ⭐ | ⭐⭐⭐⭐ | **Semantic** |
| **Comment/TODO search** | ❌ | ⭐⭐⭐⭐ | **Semantic** |
| **Code in strings** | ❌ | ⭐⭐⭐ | **Semantic** |
| **Cross-file navigation** | ⭐⭐⭐⭐⭐ | ⭐ | **LSP** |
| **Anonymous functions** | ❌ | ⭐⭐ | **Semantic** |
| **Search speed** | ⚡ (instant) | 🐢 (100-500ms) | **LSP** |
| **Freshness** | ✅ (live) | ⚠️ (needs reindex) | **LSP** |

---

## Summary

**LSP and Semantic Search are complementary, not competitors.**

Use LSP when you know **what** you're looking for (symbol names, references).
Use Semantic when you know **what you want to accomplish** (authenticate user, validate input, process payment).

The embedding dimension mismatch fix prevents the most critical UX failure - user can now recover gracefully with a clear "Force Reindex" workflow.
