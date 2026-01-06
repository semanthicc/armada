# LSP vs Semantic vs Standard Tools: 15-Round Comparison

**Date**: 2026-01-06
**Objective**: Compare efficacy of LSP (Serena), Semantic Search (Semanthicc), and Standard Tools (Grep/Rg/Glob) across 15 diverse search scenarios.

## Methodology
Each test round compares:
1.  **LSP**: `serena_find_symbol`, `serena_find_referencing_symbols`, `serena_get_symbols_overview`, `serena_find_file`, `serena_search_for_pattern`
2.  **Semantic**: `semanthicc search`
3.  **Standard**: `grep`, `glob`, `ast_grep_search`

---

## Category 1: Exact Symbol & Definition Lookup

### Round 1: Class Definition - `CircuitBreaker`
**Target**: Find the definition of the `CircuitBreaker` class.

*   **LSP**: `serena_find_symbol("CircuitBreaker", include_body=true)`
    *   **Result**: Found exact class definition in `src/indexer/indexer.ts` (lines 22-64).
    *   **Verdict**: ✅ Perfect precision.
*   **Semantic**: `semanthicc search "CircuitBreaker class definition" focus:code`
    *   **Result**: Found `src/indexer/indexer.ts` (lines 69-142) as #2, but missed the actual class definition chunk (lines 22-64).
    *   **Verdict**: ❌ Missed exact chunk.
*   **Standard**: `grep "class CircuitBreaker"`
    *   **Result**: Found exact line in `src/indexer/indexer.ts`.
    *   **Verdict**: ✅ Simple and effective.

### Round 2: Function Definition - `indexProject`
**Target**: Find the definition of the `indexProject` function.

*   **LSP**: `serena_find_symbol("indexProject")`
    *   **Result**: Found 2 definitions (dashboard API and indexer logic).
    *   **Verdict**: ✅ Disambiguated both usages (frontend vs backend).
*   **Semantic**: `semanthicc search "indexProject function definition"`
    *   **Result**: Found `src/indexer/indexer.ts` (lines 142-173) as #1. Correct chunk.
    *   **Verdict**: ✅ Good result.
*   **Standard**: `grep "function indexProject"`
    *   **Result**: Found definition line.
    *   **Verdict**: ✅ Effective.

### Round 3: Interface Definition - `IndexOptions`
**Target**: Find the definition of the `IndexOptions` interface.

*   **LSP**: `serena_find_symbol("IndexOptions", include_kinds=[11])`
    *   **Result**: Found exact definition in `src/indexer/indexer.ts`.
    *   **Verdict**: ✅ Perfect.
*   **Semantic**: `semanthicc search "IndexOptions interface definition"`
    *   **Result**: Found `src/indexer/indexer.ts` as #2, but #1 was irrelevant.
    *   **Verdict**: ⚠️ Noisy.
*   **Standard**: `grep "interface IndexOptions"`
    *   **Result**: Found exact line.
    *   **Verdict**: ✅ Effective.

---

## Category 2: References & Usage

### Round 4: Function Usage - `embedText`
**Target**: Find all places where `embedText` is called.

*   **LSP**: `serena_find_referencing_symbols("embedText")`
    *   **Result**: Found 13 references across 5 files, including test callbacks and imports.
    *   **Verdict**: ✅✅ Comprehensive and structured.
*   **Semantic**: `semanthicc search "embedText usage callers"`
    *   **Result**: Found files *containing* the term, but not specific call sites. Top result was imports in `embed.ts`.
    *   **Verdict**: ❌ Not designed for reference finding.
*   **Standard**: `grep "embedText\("`
    *   **Result**: Found 11 matches (literal calls). Missed imports or non-parentheses usages (if any).
    *   **Verdict**: ✅ Good for finding calls, but requires regex tuning.

### Round 5: Type Usage - `EmbeddingConfig`
**Target**: Find all usages of the `EmbeddingConfig` type.

*   **LSP**: `serena_find_referencing_symbols("EmbeddingConfig")`
    *   **Result**: Found 12 references across multiple files (config.ts, embed.ts, dashboard, etc.).
    *   **Verdict**: ✅ Excellent coverage.
*   **Semantic**: `semanthicc search "EmbeddingConfig usage"`
    *   **Result**: Found relevant files (config.ts, embed.ts) but again, just chunks of text, not precise usages.
    *   **Verdict**: ⚠️ Good for finding *related* files, bad for exact usage analysis.
*   **Standard**: `grep "EmbeddingConfig"`
    *   **Result**: Found 139 matches. Extremely noisy (includes imports, comments, string literals in docs).
    *   **Verdict**: ❌ Too noisy.

### Round 6: Constant Usage - `MAX_RETRIES`
**Target**: Find where `MAX_RETRIES` is used.

*   **LSP**: `serena_find_referencing_symbols("MAX_RETRIES")`
    *   **Result**: Found usage in `withRetry` function default parameter.
    *   **Verdict**: ✅ Precise.
*   **LSP (Regex)**: `serena_search_for_pattern(substring_pattern="MAX_RETRIES")`
    *   **Result**: Found 2 matches (definition + usage).
    *   **Verdict**: ✅ Equivalent to Grep.
*   **Semantic**: `semanthicc search "MAX_RETRIES constant usage"`
    *   **Result**: Found `src/indexer/indexer.ts` but didn't highlight the constant usage specifically.
    *   **Verdict**: ⚠️ Weak.
*   **Standard**: `grep "MAX_RETRIES"`
    *   **Result**: Found definition and usage immediately.
    *   **Verdict**: ✅ Excellent for unique constants.

---

## Category 3: Pattern & Partial Matching

### Round 7: Naming Pattern - `*Error`
**Target**: Find all custom error classes (ending in "Error").

*   **LSP**: `serena_find_symbol(substring_matching=True, "Error")`
    *   **Result**: Found `EmbeddingConfigMismatchError`, `GeminiLocationError`, `DuplicateMemoryError` etc. Also found `parseGeminiError` (function) and `isError` (property).
    *   **Verdict**: ✅ Found all classes + some extra noise.
*   **LSP (Regex)**: `serena_search_for_pattern(substring_pattern="class \\w*Error\\b")`
    *   **Result**: Found `EmbeddingConfigMismatchError`, `GeminiLocationError`, `DuplicateMemoryError`.
    *   **Verdict**: ✅✅ Perfect. Matches Grep's precision.
*   **Semantic**: `semanthicc search "custom error classes names"`
    *   **Result**: Found `src/hooks/error-detect.ts` (regex patterns), not the class definitions.
    *   **Verdict**: ❌ Failed to list classes.
*   **Standard**: `grep "class \w*Error\b"`
    *   **Result**: Found `GeminiLocationError`, `EmbeddingConfigMismatchError`.
    *   **Verdict**: ✅ Precise with regex.

### Round 8: File Pattern - Test Files
**Target**: Find all test files (`*.test.ts`).

*   **LSP**: `serena_find_file(file_mask="*.test.ts")`
    *   **Result**: Found all 28 test files correctly.
    *   **Verdict**: ✅✅ Works perfectly.
*   **Semantic**: `semanthicc search "test files"`
    *   **Result**: Found exclusion lists and test-utils, but not a list of test files.
    *   **Verdict**: ❌ Semantic search searches *content*, not *filenames*.
*   **Standard**: `glob "**/*.test.ts"`
    *   **Result**: Found 28 test files.
    *   **Verdict**: ✅✅ The only tool for the job.

### Round 9: AST Pattern - Console Logs
**Target**: Find all `console.log` calls in the codebase.

*   **Semantic**: `semanthicc search "console.log usage"`
    *   **Result**: Found `logger.ts` (wrapper), `index.ts` (Hello message).
    *   **Verdict**: ⚠️ Found some, but not exhaustive.
*   **Standard (AST)**: `ast_grep_search("console.log($$$)")`
    *   **Result**: Found exactly 4 calls (logger, indexer x2, index).
    *   **Verdict**: ✅✅ Best for code structure matching.
*   **Standard (Grep)**: `grep "console.log\("`
    *   **Result**: Found same 4 calls.
    *   **Verdict**: ✅ Equivalent here, but AST is safer against multiline/formatting variance.

---

## Category 4: Conceptual & Intent Search

### Round 10: Concept - Circuit Breaker Logic
**Target**: "How does the circuit breaker mechanism work?"

*   **Semantic**: `semanthicc search "How does the circuit breaker mechanism work?" focus:mixed`
    *   **Result**: Found `src/indexer/indexer.ts` (imports/reset logic) and `TESTS.md` (overview). Missed the class implementation chunk in the vector search top 5.
    *   **Verdict**: ⚠️ Contextual but missed the "meat" of the code (lines 22-64) in top results.
*   **LSP**: `serena_find_referencing_symbols("CircuitBreaker")`
    *   **Result**: Pointed to usage site `embeddingCircuitBreaker = new CircuitBreaker()`.
    *   **Verdict**: ✅ Useful to find entry point.

### Round 11: Feature - AST Chunking
**Target**: "Where is the AST chunking logic implemented?"

*   **Semantic**: `semanthicc search "Where is the AST chunking logic implemented?" focus:mixed`
    *   **Result**: Found `docs/v1.7.0-roadmap.md`, `src/indexer/ast-chunker.ts` (imports), and test files.
    *   **Verdict**: ✅ Successfully pointed to `src/indexer/ast-chunker.ts`.
*   **LSP**: `serena_get_symbols_overview("src/indexer/ast-chunker.ts")`
    *   **Result**: Showed `splitIntoAstChunks` function.
    *   **Verdict**: ✅ confirmed relevant symbols.

### Round 12: Architecture - Keyword Extraction
**Target**: "How are keywords extracted from the code?"

*   **Semantic**: `semanthicc search "How are keywords extracted from the code?" focus:mixed`
    *   **Result**: Found `src/hooks/keywords.test.ts`, `src/hooks/keywords.ts`, and `design.md` explanation of Hybrid Retrieval.
    *   **Verdict**: ✅✅ Excellent. Found implementation, tests, and design docs.

---

## Category 5: Non-Code & Mixed Content

### Round 13: Configuration - Timeout Settings
**Target**: Find timeout configurations (e.g., `CIRCUIT_BREAKER_RESET_MS`).

*   **Semantic**: `semanthicc search "default timeout settings" focus:mixed`
    *   **Result**: Found `specs/heuristics.md`, `status.ts`. Did NOT find the constant definitions in `indexer.ts`.
    *   **Verdict**: ❌ Missed the code constants.
*   **Standard**: `grep "_MS"`
    *   **Result**: Found `RETRY_DELAY_MS`, `CIRCUIT_BREAKER_RESET_MS` immediately.
    *   **Verdict**: ✅ Effective if naming convention is guessed.

### Round 14: Documentation - Project README
**Target**: Find the project overview in the README.

*   **Semantic**: `semanthicc search "project overview readme" focus:mixed`
    *   **Result**: Found `docs/patchlog.md`, `design.md`, `specs/plugin.md`.
    *   **Verdict**: ⚠️ Found related docs, but not the root README.
*   **LSP**: `serena_get_symbols_overview("README.md")`
    *   **Result**: Empty (LSP parses code, not markdown headers).
    *   **Verdict**: ❌ Not applicable.

### Round 15: TODOs & Fixes - Pending Tasks
**Target**: Find "TODO" comments in the code.

*   **Semantic**: `semanthicc search "TODO comments" focus:mixed`
    *   **Result**: Found `src/hooks/passive-learner.test.ts` (string "todoread"), `docs/edge-cases-testing.md`.
    *   **Verdict**: ⚠️ Found *mentions* of TODOs in docs/tests, not the TODOs themselves.
*   **Standard**: `grep "TODO"`
    *   **Result**: Found 16 matches, including actual TODOs in `design.md` and `docs`.
    *   **Verdict**: ✅ Best tool for finding literal TODO tags.
*   **LSP (Regex)**: `serena_search_for_pattern("TODO")`
    *   **Result**: Found 16 matches (same as Grep).
    *   **Verdict**: ✅ Equal to Grep.

---

## Final Verdict & Tool Selection Matrix

| Scenario | 🏆 Best Tool | 🥈 Runner Up | ❌ Avoid |
| :--- | :--- | :--- | :--- |
| **Exact Symbol Definition** (Class, Func) | **LSP** (`find_symbol`) | **Grep** | Semantic (hit/miss) |
| **Finding References** (Who calls X?) | **LSP** (`find_references`) | Grep (noisy) | Semantic |
| **Type Usage** (Interfaces, Types) | **LSP** (`find_references`) | None | Grep (too noisy) |
| **Unique Constants** | **Grep** / **LSP Regex** (`search_pattern`) | Semantic | |
| **Files by Pattern** (*.test.ts) | **LSP Find File** (`find_file`) | Glob | LSP Symbol, Semantic |
| **Code Structure** (console.log) | **AST Grep** | Grep / LSP Regex | Semantic |
| **Naming Patterns** (*Error) | **LSP Regex** / **Grep** | LSP Substring | Semantic |
| **Concepts & "How to"** | **Semantic** | None | Grep, LSP |
| **Architecture & Design** | **Semantic** | None | Grep, LSP |
| **TODOs & Tags** | **LSP Regex** / **Grep** | Semantic | LSP Symbol |

### Key Takeaways
1.  **Serena Suite is Complete**: With `serena_find_file` and `serena_search_for_pattern`, the Serena suite effectively covers all standard `grep`/`glob` use cases while keeping you in the tool ecosystem.
2.  **LSP is King for Code**: Unbeatable for references, definitions, and types.
3.  **Semantic is for Intent**: Use it when you don't know the name of what you're looking for ("how does auth work?", "keyword extraction logic").
4.  **AST Grep is Unique**: Still needed for structural pattern matching where regex fails.
