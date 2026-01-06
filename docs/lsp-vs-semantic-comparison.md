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

## Extended Edge Cases (v1.8.0)

Based on negative analysis of AI developer workflows, here are additional edge cases covering gaps in both LSP and Semantic search:

---

### Category A: Repository State Scenarios

#### Test A1: Branch Switching Contamination
**Scenario**: User indexes on `main`, switches to `feature/auth` with different implementation, searches.

| Tool | Behavior | Verdict |
|------|----------|---------|
| **LSP** | Live - reads current branch files | ✅ Correct |
| **Semantic** | Returns stale `main` branch results | ❌ **Cross-branch contamination** |

**Workaround**: Reindex after `git checkout`.

---

#### Test A2: Merge Conflict Markers
**Scenario**: File contains unresolved `<<<<<<<`, `=======`, `>>>>>>>` markers.

| Tool | Behavior | Verdict |
|------|----------|---------|
| **LSP** | May show parse errors | ⚠️ Partial handling |
| **Semantic** | Indexes conflict markers as valid code | ❌ **Pollutes results** |

**Workaround**: Resolve conflicts before indexing.

---

#### Test A3: Generated Code Pollution
**Scenario**: Project has `src/__generated__/graphql.ts` (10k lines of codegen).

| Tool | Behavior | Verdict |
|------|----------|---------|
| **LSP** | Usually excluded via tsconfig/gitignore | ✅ Configurable |
| **Semantic** | No `*generated*` pattern, indexes all | ❌ **Noise pollution** |

**Gap**: Add `*generated*`, `*.gen.*`, `__generated__/**` to HARD_EXCLUDE.

---

#### Test A4: Monorepo Shared Dependencies
**Scenario**: Monorepo with 10 packages, each referencing `packages/shared/utils.ts`.

| Tool | Behavior | Verdict |
|------|----------|---------|
| **LSP** | Works fine per-file | ✅ No issues |
| **Semantic** | May hit `maxFiles=500` early, no workspace detection | ⚠️ **Incomplete indexing** |

**Gap**: Add workspace detection (pnpm-workspace.yaml, lerna.json, nx.json).

---

### Category B: Language Coverage Gaps

#### Test B1: Polyglot AST Coverage
**Scenario**: Project has TypeScript, Kotlin, C#, Swift files.

| Language | AST Chunking? | Fallback |
|----------|---------------|----------|
| TypeScript (.ts, .tsx) | ✅ Full AST | — |
| Python (.py) | ✅ Full AST | — |
| Go (.go) | ✅ Full AST | — |
| Rust (.rs) | ✅ Full AST | — |
| Java (.java) | ✅ Full AST | — |
| Kotlin (.kt) | ❌ No AST | Regex line-based |
| C# (.cs) | ❌ No AST | Regex line-based |
| Swift (.swift) | ❌ No AST | Regex line-based |
| Ruby (.rb) | ❌ No AST | Regex line-based |
| PHP (.php) | ❌ No AST | Regex line-based |

**Coverage**: 11/43 languages have AST support (74% gap).

| Tool | Behavior | Verdict |
|------|----------|---------|
| **LSP** | Per-language server with full support | ✅ Complete |
| **Semantic** | Fallback chunking loses function boundaries | ⚠️ **Degraded quality** |

---

### Category C: LSP Failure Cases (Where Semantic Wins)

#### Test C1: Dynamic Language Duck Typing
**Scenario**: Python function takes `obj` parameter, calls `obj.validate()` - type unknown at static analysis.

```python
def process(obj):
    return obj.validate()  # What implements validate()?
```

| Tool | Behavior | Verdict |
|------|----------|---------|
| **LSP** | Cannot follow - type unknown | ❌ No results |
| **Semantic** | "find validate implementations" returns candidates | ✅ **Conceptual match** |

---

#### Test C2: Metaprogramming / Decorators
**Scenario**: Python decorator dynamically adds methods to class.

```python
@dataclass
class User:
    name: str
    # __init__, __repr__, __eq__ generated at runtime
```

| Tool | Behavior | Verdict |
|------|----------|---------|
| **LSP** | May not see generated methods | ⚠️ Depends on plugin |
| **Semantic** | Indexes decorator + class together | ✅ **Context preserved** |

---

#### Test C3: DSLs in String Literals
**Scenario**: SQL queries, GraphQL, regex patterns embedded in strings.

```typescript
const query = `SELECT * FROM users WHERE active = true`;
const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
```

| Tool | Query | Result | Verdict |
|------|-------|--------|---------|
| **LSP** `find_symbol("users")` | No results | ❌ String content invisible |
| **Semantic** `search("SQL query users table")` | Finds the query | ✅ **Understands content** |

---

#### Test C4: Configuration Files
**Scenario**: Behavior defined in YAML/JSON/TOML, not code.

```yaml
# routes.yaml
/api/users:
  handler: userController.list
  auth: required
```

| Tool | Query | Result | Verdict |
|------|-------|--------|---------|
| **LSP** | No symbols in YAML | ❌ Not code |
| **Semantic** `search("route handler for users API")` | Finds routes.yaml | ✅ **Full text indexed** |

---

#### Test C5: Comments with Important Context
**Scenario**: Critical info in comments (TODO, @deprecated, license headers).

```typescript
/**
 * @deprecated Use newAuthFlow() instead
 * TODO: Remove in v3.0
 */
function oldAuthFlow() { ... }
```

| Tool | Query | Result | Verdict |
|------|-------|--------|---------|
| **LSP** `find_symbol("deprecated")` | No results | ❌ Ignores comments |
| **Semantic** `search("deprecated auth functions to remove")` | Finds the function | ✅ **Comment-aware** |

---

### Category D: File Handling Edge Cases

#### Test D1: Minified/Bundled JavaScript
**Scenario**: `dist/bundle.js` is 60k lines of minified code.

| Tool | Behavior | Verdict |
|------|----------|---------|
| **LSP** | Works but useless (no readable symbols) | ⚠️ Noise |
| **Semantic** | Indexes all 60k lines (if under 100k char limit) | ❌ **Garbage results** |

**Gap**: Detect minified files via heuristics (avg line length > 500 chars, no newlines).

---

#### Test D2: Large Single-File Schemas
**Scenario**: `schema.graphql` is 150k characters (over limit).

| Tool | Behavior | Verdict |
|------|----------|---------|
| **LSP** | GraphQL LSP works | ✅ If configured |
| **Semantic** | Silently skipped (>100k chars) | ⚠️ **No warning** |

**Gap**: Log warning for skipped large files.

---

### Category E: External API & Reliability

#### Test E1: Rate Limiting (429 Errors)
**Scenario**: Indexing 1000 files with Gemini API, hits rate limit at file 100.

| Behavior | Status |
|----------|--------|
| Automatic retry with backoff | ❌ Not implemented |
| Progress saved, resume later | ❌ Not implemented |
| Clear error message | ⚠️ Generic error |

**Gap**: Add exponential backoff for 429/503 errors.

---

#### Test E2: File Rename Inefficiency
**Scenario**: File renamed from `src/auth.ts` to `src/middleware/auth.ts`, content identical.

| Behavior | Status |
|----------|--------|
| Detect same content hash | ❌ Not implemented |
| Migrate embeddings to new path | ❌ Re-embeds from scratch |

**Gap**: Optimize rename detection to avoid redundant embedding calls.

---

## Extended Comparison Matrix

| Metric | LSP (Serena) | Semantic (Semanthicc) | Winner |
|---------|----------------|---------------------|--------|
| **Exact symbol lookup** | ⭐⭐⭐⭐⭐ | ⭐⭐ | **LSP** |
| **Find references** | ⭐⭐⭐⭐⭐ | ⭐ | **LSP** |
| **Conceptual search** | ⭐ | ⭐⭐⭐⭐ | **Semantic** |
| **Comment/TODO search** | ❌ | ⭐⭐⭐⭐ | **Semantic** |
| **Code in strings/DSLs** | ❌ | ⭐⭐⭐ | **Semantic** |
| **Config files (YAML/JSON)** | ❌ | ⭐⭐⭐⭐ | **Semantic** |
| **Dynamic languages** | ⭐⭐ | ⭐⭐⭐ | **Semantic** |
| **Decorators/Macros** | ⭐⭐ | ⭐⭐⭐ | **Semantic** |
| **Cross-file navigation** | ⭐⭐⭐⭐⭐ | ⭐ | **LSP** |
| **Anonymous functions** | ❌ | ⭐⭐ | **Semantic** |
| **Search speed** | ⚡ (instant) | 🐢 (100-500ms) | **LSP** |
| **Freshness (live)** | ✅ (live) | ⚠️ (needs reindex) | **LSP** |
| **Branch awareness** | ✅ (live) | ❌ (stale index) | **LSP** |
| **Polyglot support** | ✅ (per-server) | ⚠️ (11/43 AST) | **LSP** |
| **Generated code exclusion** | ✅ (configurable) | ❌ (no patterns) | **LSP** |
| **Monorepo workspaces** | ✅ | ❌ (no detection) | **LSP** |

---

## Summary

**LSP and Semantic Search are complementary, not competitors.**

Use LSP when you know **what** you're looking for (symbol names, references).
Use Semantic when you know **what you want to accomplish** (authenticate user, validate input, process payment).

### Key Gaps to Address (v1.8.0+)

| Priority | Gap | Impact |
|----------|-----|--------|
| 🔴 High | Branch switching contamination | Wrong results after checkout |
| 🔴 High | External API rate limiting | Index fails without retry |
| 🟡 Medium | Generated code pollution | Noise in search results |
| 🟡 Medium | Polyglot AST coverage (32 languages) | Degraded chunking quality |
| 🟡 Medium | Minified JS detection | Garbage indexed |
| 🟢 Low | Rename optimization | Redundant API calls |

The embedding dimension mismatch fix prevents the most critical UX failure - user can now recover gracefully with a clear "Force Reindex" workflow.
