# Edge Cases: Serena LSP vs Semanthicc Semantic Search

## Test Matrix Overview

| Category | LSP Strengths | Semantic Strengths | Both Weak |
|----------|---------------|-------------------|-----------|
| Symbol lookup | Exact names, refs | Concepts, synonyms | Dynamic code |
| Cross-file | References | Context similarity | Re-exports |
| Content types | Code symbols only | Comments, docs | String literals |
| Freshness | Always live | Requires reindex | - |

---

## Category 1: Symbol Discovery

### Test 1.1: Partial Symbol Name
- **Query:** "get" to find "getUserById", "getStatus", etc.
- **LSP:** `find_symbol(substring_matching=true)` - EXACT pattern match
- **Semantic:** "get user function" - conceptual match
- **Expected:** LSP finds more symbols, semantic finds conceptually related

### Test 1.2: Semantic Synonyms
- **Query:** "login" to find "authenticate", "signIn", "verifyCredentials"
- **LSP:** FAILS - no symbol named "login"
- **Semantic:** SHOULD find auth-related functions
- **Expected:** Semantic wins for conceptual queries

### Test 1.3: Anonymous Functions / Arrow Callbacks
- **Query:** Find callback that validates user input
- **LSP:** FAILS - no named symbol
- **Semantic:** May find if chunk includes context
- **Test code:**
```typescript
app.post('/login', async (req, res) => {
  // validates user credentials here
  const isValid = checkPassword(req.body.password);
});
```

### Test 1.4: Overloaded Methods (Java/TS)
- **Query:** Find specific overload of `process(string)` vs `process(number)`
- **LSP:** `find_symbol("process[0]")` or `find_symbol("process[1]")`
- **Semantic:** Cannot distinguish overloads
- **Expected:** LSP wins for overload disambiguation

---

## Category 2: Cross-Reference

### Test 2.1: Find All Usages
- **Query:** Where is `UserService` used?
- **LSP:** `find_referencing_symbols` - COMPLETE list
- **Semantic:** "where is UserService used" - partial, depends on chunks
- **Expected:** LSP is authoritative for reference finding

### Test 2.2: Re-exports / Barrel Files
- **Query:** Find actual definition when re-exported through index.ts
- **LSP:** May stop at re-export
- **Semantic:** May find original or re-export
- **Test code:**
```typescript
// src/services/index.ts (barrel)
export { UserService } from './user.service';
export { AuthService } from './auth.service';
```

### Test 2.3: Dynamic Imports
- **Query:** Find dynamically imported module
- **LSP:** FAILS - not statically analyzable
- **Semantic:** May find if string literal indexed
- **Test code:**
```typescript
const module = await import(`./plugins/${pluginName}`);
```

---

## Category 3: Content Types

### Test 3.1: Code in String Literals
- **Query:** Find SQL query "SELECT * FROM users"
- **LSP:** FAILS - not a symbol
- **Semantic:** Should find if chunk includes
- **Test code:**
```typescript
const query = `SELECT * FROM users WHERE id = $1`;
```

### Test 3.2: Comments vs Code
- **Query:** "TODO fix authentication bug"
- **LSP:** FAILS - comments not symbols
- **Semantic:** SHOULD find - comments are indexed
- **Expected:** Semantic wins for comment search

### Test 3.3: JSDoc / Docstrings
- **Query:** "@param userId the user identifier"
- **LSP:** FAILS - JSDoc not a symbol
- **Semantic:** Should find if properly chunked
- **Risk:** JSDoc may be split from function in line-based chunking

---

## Category 4: Index Freshness (CRITICAL)

### Test 4.1: Stale Index - Renamed Symbol
- **Steps:**
  1. Index project with function `oldName()`
  2. Rename to `newName()` (don't reindex)
  3. Search for "oldName"
- **LSP:** Returns nothing (correct - symbol gone)
- **Semantic:** Returns stale result pointing to old location
- **Expected:** Semantic should detect staleness or warn

### Test 4.2: New File Not Indexed
- **Steps:**
  1. Create new file `newFeature.ts`
  2. Search for content in new file
- **LSP:** Finds immediately (live)
- **Semantic:** FAILS until reindex
- **Expected:** Need coverage check / auto-reindex

### Test 4.3: Deleted File Ghost Results
- **Steps:**
  1. Index project
  2. Delete `oldFile.ts`
  3. Search for content from deleted file
- **LSP:** Returns nothing (correct)
- **Semantic:** Returns ghost result with invalid path
- **Expected:** Semantic should validate file exists

### Test 4.4: EMBEDDING DIMENSION MISMATCH (NEW BUG FOUND)
- **Steps:**
  1. Index with Provider A (e.g., local, 384 dims)
  2. Change config to Provider B (e.g., Gemini, 768 dims)
  3. Search
- **Result:** `Error: No vector column found to match dimension 384`
- **Root Cause:** Stored vectors have different dimensions than query vector
- **Fix Required:**
  1. Store embedding config metadata with index
  2. Validate dimensions match on search
  3. Warn user if mismatch, suggest reindex

---

## Category 5: Chunking Issues

### Test 5.1: Function Split Across Chunks
- **Query:** Find logic in middle of 500-line function
- **Risk:** Line-based chunking (300 lines) splits function
- **Expected:** Context lost, partial matches
- **Fix:** AST-based chunking respects function boundaries

### Test 5.2: Import Context Lost
- **Query:** "where is lodash imported"
- **Risk:** Imports at top of file, usage at bottom = different chunks
- **Expected:** Can't correlate import with usage
- **Fix:** Keep imports attached to first chunk or separate import index

### Test 5.3: Nested Structures
- **Query:** Find inner function of class method
- **LSP:** `find_symbol("Class/method/inner", depth=2)`
- **Semantic:** May find if chunk small enough
- **Test code:**
```typescript
class UserService {
  async processUser(id: string) {
    const validate = () => { // inner function
      return id.length > 0;
    };
    return validate();
  }
}
```

---

## Category 6: Special Cases

### Test 6.1: Case Sensitivity
- **Query:** "getUser" vs "getuser" vs "GETUSER"
- **LSP:** Typically case-sensitive
- **Semantic:** Embedding model may normalize
- **Expected:** Document behavior difference

### Test 6.2: Unicode Identifiers
- **Query:** Function with Japanese name `ユーザー取得`
- **LSP:** Should work if language server supports
- **Semantic:** Depends on tokenizer
- **Risk:** May fail or produce garbage embeddings

### Test 6.3: Very Long Identifiers
- **Query:** 100+ character function name
- **LSP:** Should work
- **Semantic:** Token limit may truncate
- **Risk:** Partial embedding, poor recall

---

## Priority Matrix

| Test ID | Priority | Blocks Release | Effort |
|---------|----------|----------------|--------|
| 4.4 (Dimension Mismatch) | CRITICAL | YES | 3h |
| 4.1-4.3 (Staleness) | HIGH | YES | 2h |
| 5.1 (Function Split) | HIGH | NO (v1.5) | 5h |
| 1.2, 3.2 (Semantic wins) | MEDIUM | NO | 1h |
| 2.1 (LSP refs) | MEDIUM | NO | 1h |
| 5.3, 6.* (Edge) | LOW | NO | 2h |

---

## Immediate Action Items

### Bug Fix: Embedding Dimension Mismatch (v1.4.1)

1. **Add metadata table** to store embedding config per project:
   ```typescript
   interface IndexMetadata {
     projectId: number;
     embeddingProvider: 'local' | 'gemini';
     embeddingModel: string;
     dimensions: number;
     indexedAt: Date;
   }
   ```

2. **Validate on search:**
   ```typescript
   async function validateEmbeddingConfig(projectId: number): Promise<{
     valid: boolean;
     stored: IndexMetadata;
     current: EmbeddingConfig;
     mismatch?: 'provider' | 'model' | 'dimensions';
   }>
   ```

3. **Handle mismatch:**
   - Return helpful error: "Index was created with X (384 dims), but current config uses Y (768 dims). Run `semanthicc index --force` to reindex."
   - Add `--force` flag to reindex even if coverage is 100%

4. **Add to status output:**
   ```
   Index: 246 chunks | Provider: local (384 dims) | Last indexed: 34m ago
   ```

### Tests to Write

```typescript
describe('embedding dimension mismatch', () => {
  it('should error with helpful message when dimensions mismatch', async () => {
    // Index with 384-dim provider
    // Switch to 768-dim provider
    // Search should throw with actionable error
  });

  it('should store embedding metadata on index', async () => {
    // Index project
    // Verify metadata stored
  });

  it('should allow force reindex when provider changes', async () => {
    // Index with provider A
    // Change to provider B
    // Force reindex should work
  });
});
```

---

## Implementation Status (v1.4.1)

### Completed ✅

| Item | Status | Notes |
|------|--------|-------|
| Embedding dimension mismatch fix | ✅ DONE | `EmbeddingConfigMismatchError` with helpful message |
| Metadata table `embedding_config` | ✅ DONE | Stores provider, model, dimensions per project |
| `validateEmbeddingConfig()` | ✅ DONE | Checks stored vs current before search |
| `--force` flag for reindex | ✅ DONE | Via dashboard API `POST /index?force=true` |
| Status output with provider/dims | ✅ DONE | Shows "local (384 dims)" in status |
| Tests for all above | ✅ DONE | 12 tests in `config-store.test.ts` |

### Known Limitations (Documented, Not Fixed)

| Issue | Behavior | Mitigation |
|-------|----------|------------|
| Stale index after rename | Old symbol name still searchable | Use `getIndexCoverage()` to detect stale files |
| Deleted file ghost results | Search returns result for deleted file | Results include file path - user can verify |
| New file not indexed | Search misses new content | Dashboard shows "X files changed" warning |

### Deferred to v1.6.0

| Feature | Reason |
|---------|--------|
| AST-based chunking | LSP covers most use cases; adds complexity, limited language support |
| File watcher auto-reindex | Opt-in feature, needs careful design |

---

## AST Chunking Decision (5-Approaches Analysis)

### Question: Should we implement tree-sitter based AST chunking?

### Answer: **DEFER to v1.6.0**

### Reasoning:

1. **Limited value for embeddings**: The embedding model doesn't care about syntax - it just tokenizes text. AST chunking improves *retrieved context completeness*, not embedding quality.

2. **LSP already covers structured search**: For "find function X" type queries, Serena LSP is superior. Semantic search excels at conceptual queries where complete function bodies are less critical.

3. **Complexity vs ROI**:
   - tree-sitter adds ~3MB WASM + parsing overhead
   - Language coverage requires maintaining multiple grammars
   - Edge cases (decorators, nested classes, JSX) are complex

4. **Hybrid alternative is simpler**: Increase token overlap to 50% - captures most context, zero dependencies.

### When to reconsider:
- User feedback shows search quality issues with large functions
- Multi-language monorepo support becomes priority
- Performance benchmarks show token chunking causing recall issues

