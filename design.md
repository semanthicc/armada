# DESIGN.md — OpenCode Semanthicc

> Full Document Overview — What I'll Include

## Document Structure

```
DESIGN.md (~2000 lines estimated)
├── PART 1: EXECUTIVE SUMMARY
├── PART 2: PROBLEM ANALYSIS (5 Approaches × 3 problems)
├── PART 3: USE CASES (Daily Workflow Mapping)
├── PART 4: ARCHITECTURE DECISIONS (ADR-style with rationale)
├── PART 5: DATA MODEL (Schema + Evolution)
├── PART 6: STALENESS & EVOLUTION (Deep Dive)
├── PART 7: MULTI-PROJECT ISOLATION (Critical Design)
├── PART 8: MVP ROADMAP (Granular TODOs)
├── PART 9: WHAT WE'RE NOT BUILDING
└── APPENDIX: Reference Research (ELF, memory-ts, claude-context)
```

---

## What Each Section Contains

---

## PART 1: Executive Summary

> **Memory for LLM coding agents — least tokens, most mistake prevention.**

### Philosophy

> *"Talk is cheap. Show me the code."* — Linus Torvalds

This system optimizes for: **LEAST tokens** that prevent **MOST repeated mistakes**.

We don't dump context. We inject precision. Every token injected must earn its place by preventing a concrete failure or answering a real question.

**Token budget**: MAX 2k tokens per session injection.

### The 3 Pillars

| Pillar | Purpose | Answers |
|--------|---------|---------|
| **Code Understanding** | Semantic search across codebase | *"How does X work here?"* |
| **Heuristics** | Confidence-tracked patterns that strengthen over time | *"What's our pattern for Y?"* |
| **Evolution** | Knowledge chains that preserve history without polluting context | *"Why is it like this?"*

---

## PART 2: Problem Analysis (Full 5 Approaches)

### Problem A: "AI repeats mistakes"

| Approach | Analysis |
|----------|----------|
| First Principles | Memory = what worked & failed, strengthened over time |
| Inversion | Fail: no tracking, no decay, stale patterns |
| Analogies | ELF confidence tracking, Wikipedia revisions |
| Blue Sky | Auto-detect success/failure from test results |
| MVP | Manual record + confidence counters |

### Problem B: "AI doesn't know codebase"

| Approach | Analysis |
|----------|----------|
| First Principles | Need semantic understanding, not just grep |
| Inversion | Fail: stale embeddings, wrong chunks, token bloat |
| Analogies | claude-context hybrid search, LSP indexing |
| Blue Sky | Real-time file watching, perfect chunking |
| MVP | Git hook invalidation + lazy verify |

### Problem C: "Decisions get lost"

| Approach | Analysis |
|----------|----------|
| First Principles | Knowledge evolves, not just expires |
| Inversion | Fail: delete history, no links, wrong current |
| Analogies | Git commit chain, ADR supersession |
| Blue Sky | Auto-detect "this replaces that" |
| MVP | Manual supersede + status field |

---

## PART 3: Use Cases (Complete Workflow Mapping)

### Daily Workflow → Memory Trigger Matrix

| Time of Day | Activity | Memory Trigger | Type |
|-------------|----------|----------------|------|
| Morning | Open old project | Session start | Heuristics |
| Morning | "WTF was I doing?" | Explicit | Session history |
| Task start | "Where is this code?" | Query | Semantic search |
| Debugging | "We had this bug before" | Auto-detect | Failure similarity |
| Implementation | "How do we do X here?" | Query | Semantic search |
| Implementation | Keep making same error | Violation | Heuristic update |
| Code review | "Is this our pattern?" | Query | Semantic + Heuristics |
| Task complete | Fix worked | Record | Success learning |
| Context switch | Different project | Session start | Project context |

### Trigger → Retrieval Mechanism Matrix

| Trigger | Mechanism | Tokens | Memory Type |
|---------|-----------|--------|-------------|
| Session start | ✅ Auto-inject | ~500 | Heuristics + Golden Rules |
| Similar to fail | ✅ Auto-inject | ~200 | Failure warning |
| Code question | 🔧 **Tool call** | Variable | Semantic search |
| "Remember X?" | 🔧 Tool call | Variable | Manual query |
| Task complete | ❌ Write-only | 0 | Record learning |
| **AUTO-INJECT BUDGET** | | **~700 max** | |

#### Critical Distinction: Auto-Inject vs Tool Call

```
┌─────────────────────────────────────────────────────────────────────┐
│               AUTO-INJECT vs TOOL CALL                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ✅ AUTO-INJECT (every message, system prompt)                      │
│  ├── Heuristics (confidence-ranked patterns)                       │
│  ├── Golden Rules (constitutional constraints)                     │
│  ├── Failure warnings (if similar context detected)                │
│  └── Budget: ~500-700 tokens MAX                                   │
│                                                                     │
│  🔧 TOOL CALL (LLM decides when to invoke)                          │
│  ├── semanthicc search "query" → Semantic code search              │
│  ├── semanthicc remember "pattern" → Save heuristic                │
│  ├── semanthicc forget <id> → Remove memory                        │
│  └── Budget: Variable (only when LLM needs it)                     │
│                                                                     │
│  ❌ PASSIVE (no tokens, background)                                 │
│  └── tool.execute.after → Learn from tool outcomes                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Why Semantic Search is NOT Auto-Injected:**

| Auto-Inject | Tool Call |
|-------------|-----------|
| Guessing what code is relevant | LLM knows the question, decides to search |
| ~1000 tokens wasted if wrong | 0 tokens until actually needed |
| Duplicates existing tools (grep, read) | Complements existing tools |
| Every message gets code dump | Precise, on-demand retrieval |

---

## PART 4: Architecture Decisions (ADR-style)

### ADR-001: Local-First Embeddings

**Status**: ACCEPTED

**Context**: Need semantic search, options are API or local

**Decision**: Use MiniLM-L6-v2 locally (80MB, 5ms/query)

**Rationale**:
- No per-query cost
- Works offline
- Fast enough for MVP
- Same quality as API for code

**Consequences**:
- Need to bundle model
- ~80MB storage

**Alternatives Considered**:
- OpenAI embeddings: ❌ Cost, latency, dependency
- No embeddings: ❌ Can't do semantic search

---

### ADR-002: Hybrid Retrieval (BM25 + Vector)

**Status**: EVALUATED AND SKIPPED

**Context**: Pure vector search returns plausible but wrong results

**Decision**: ~~Combine keyword (BM25) + semantic (cosine) scoring~~ Use vector-only for MVP.

**Rationale (Updated 2026-01-04)**:
- Vector-only search works well enough for code
- BM25 adds complexity (tokenization, index, scoring)
- No user complaints about search quality
- Users have grep/glob/LSP for exact keyword matches
- YAGNI - can add later if needed

**Original Rationale**:
- Keywords catch exact matches vector misses
- Semantic catches meaning keyword misses
- 80/20: covers most failure modes

---

### ADR-003: Semantic Search = Tool Call, NOT Auto-Inject

**Status**: ACCEPTED

**Context**: Two options for semantic code search:
1. Auto-inject: Guess relevant code before LLM sees message
2. Tool call: LLM decides when to search codebase

**Decision**: Semantic search is a **tool call** (`semanthicc search`), NOT auto-injected.

**Rationale**:
- **LLM knows the question** — it can decide if search is needed
- **Zero waste** — no tokens spent until actually needed
- **Precision** — LLM asks for exactly what it needs
- **Complements existing tools** — grep, read, glob already exist; semantic search is an option, not a replacement
- **Transparent** — user sees "searching codebase..." in tool output

**What IS Auto-Injected**:
- Heuristics (~500 tokens) — behavioral patterns, always relevant
- Golden rules — constitutional constraints
- Failure warnings — if context matches past failure

**What is NOT Auto-Injected**:
- Code chunks from semantic search — this is a tool call
- Full file contents — use existing `read` tool

**Alternatives Considered**:
- Auto-inject top 5 code chunks: ❌ Guessing wrong = wasted tokens, confusion
- Hybrid (auto-inject + tool): ❌ Complexity, double retrieval
- No semantic search: ❌ Valuable for "how does X work here?"

---

### ADR-003.1: Native OpenCode Plugin, NOT MCP

**Status**: ACCEPTED

**Context**: Two implementation options:
1. Native OpenCode plugin using `@opencode-ai/plugin`
2. MCP server (separate process)

**Decision**: Build as **native OpenCode plugin**. No MCP for core functionality.

**Rationale**:
- **Hot path** — heuristics injected on every message; IPC adds latency
- **Fewer failure modes** — no separate process to crash
- **Simpler** — single codebase, no IPC serialization
- **Existing pattern** — opencode-elf is native plugin, works fine

**When MCP Would Be Needed**:
- Cross-editor support (VS Code, Cursor, etc.)
- This is YAGNI for OpenCode users

**Plugin Architecture**:
```typescript
export const SemanthiccPlugin: Plugin = async ({ directory }) => {
  return {
    // Auto-inject heuristics
    "experimental.chat.system.transform": async (input, output) => {
      const heuristics = await getTopHeuristics(directory);
      output.system.push(formatHeuristics(heuristics));
    },
    
    // Learn from tool outcomes
    "tool.execute.after": async (input, output) => {
      await recordToolOutcome(input.tool, output);
    },
    
    // Register semanthicc tool
    tool: {
      semanthicc: semanthiccTool
    }
  };
};
```

**Alternatives Considered**:
- MCP server: ❌ Adds IPC latency, failure modes, complexity
- Hybrid (plugin + MCP): ❌ Dual maintenance, overkill for OpenCode-only

---

### ADR-004: Heuristics Without Embeddings

**Status**: ACCEPTED

**Context**: ELF uses keyword matching, memory-ts uses vectors

**Decision**: Keep heuristics retrieval SQL-based (no embeddings)

**Rationale**:
- Heuristics are short, domain-tagged
- SQL query < 1ms, no compute needed
- Good enough: domain + keyword gets 80% accuracy
- Embeddings can be added later if needed

---

### ADR-005: Evolution via Linked List

**Status**: ACCEPTED

**Context**: Knowledge evolves (Day 1 solution → Day 3 better solution)

**Decision**: Use `superseded_by` / `evolved_from` chain with status field

**Rationale**:
- Simple to implement (2 FK columns)
- Matches mental model (like git commits)
- Enables "why is it like this?" queries
- History preserved but hidden from default queries

---

### ADR-006: Git Hook for Staleness

**Status**: ACCEPTED

**Context**: Need to detect when embeddings are stale

**Decision**: Git post-commit hook marks changed files' embeddings stale

**Rationale**:
- Only triggers on real changes
- Integrates with existing workflow
- Low overhead (runs once per commit)

**Alternatives Considered**:
- File watcher: ❌ Resource heavy, complex
- Periodic scan: ❌ Slow, might miss changes
- Lazy verify only: ⚠️ First query slow after change

---

### ADR-007: Time Decay for Heuristics

**Status**: ACCEPTED

**Context**: Old heuristics might not apply anymore

**Decision**: 30-day half-life decay on confidence

**Formula**: 
```
effective = base_confidence * (0.5 ^ (days / 30))
```

**Rationale**:
- If not validated in 30 days, probably less relevant
- Doesn't delete, just deprioritizes
- Golden rules exempt (manual promotion)

---

### ADR-008: Strict Project Isolation for Embeddings

**Status**: ACCEPTED

**Context**: User may index multiple projects (own projects + reference repos like opencode, serena). Risk of cross-contamination where query returns code chunks from wrong project.

**Decision**: Embeddings are STRICTLY isolated per project. Never cross-project queries for semantic code search.

**The Problem**:
```
Scenario: Cross-contamination
  You're in project A, ask "how does auth work?"
  System returns code chunks from project B (different auth implementation)
  AI gives advice based on WRONG codebase
```

**Rationale**:
- Embeddings answer: "Where is X in THIS codebase?" — must be project-specific
- Heuristics answer: "What patterns work?" — can be global OR project-scoped
- Mixing embeddings = guaranteed confusion

**Implementation**:
```sql
-- Embeddings ALWAYS have project_id (NOT NULL)
CREATE TABLE embeddings (
  project_id INTEGER NOT NULL REFERENCES projects(id),
  ...
);

-- Query ALWAYS scoped to current project
SELECT * FROM embeddings 
WHERE project_id = (SELECT id FROM projects WHERE path = $cwd)
```

**Alternatives Considered**:
- Cross-project search with `--all-projects` flag: ❌ Too dangerous, confusing results
- Serena-style `activate_project`: ❌ Unnecessary ceremony, path-based is simpler

---

### ADR-009: Heuristics Scoping (Project vs Global)

**Status**: ACCEPTED

**Context**: Some patterns are universal ("always run tests"), others are project-specific ("use moment.js in legacy app")

**Decision**: Heuristics have optional `project_id`. NULL = global, value = project-specific.

**Query Logic**:
```sql
-- Get heuristics: project-specific + global combined
SELECT * FROM memories 
WHERE type = 'heuristic'
AND (project_id = $current_project OR project_id IS NULL)
ORDER BY confidence DESC
```

**User Experience**:
```bash
# Project-specific (default)
elf heuristics-add "Use date-fns for dates" --domain typescript

# Explicit global (applies everywhere)
elf heuristics-add "Always run tests before commit" --domain testing --global
```

**Rationale**:
- Default to project-specific (safer, prevents pattern pollution)
- Explicit `--global` for universal truths
- Both returned in queries, but global clearly marked

---

### ADR-010: Reference Repos Are Ephemeral

**Status**: ACCEPTED

**Context**: User wants to explore other codebases (e.g., "how does opencode do X?") without polluting their active project's memory.

**Decision**: Reference repo exploration is ephemeral — indexed in-memory, discarded after session.

**Workflow**:
```bash
# 1. Start exploration session
elf explore ~/repos/opencode

# 2. Query within session (isolated)
[explore:opencode] > how does tool routing work?
# Returns chunks from opencode only

# 3. Save useful pattern as GLOBAL heuristic
[explore:opencode] > save-pattern "Tool routing uses strategy pattern"
# Saved as global (not opencode-specific, because you don't own it)

# 4. Exit — ephemeral index discarded
[explore:opencode] > exit
```

**Rationale**:
- Reference repos change — indexing once = stale forever
- You can't track validate/violate on repos you don't own
- Patterns are portable, code chunks are not
- Keeps storage clean

**Alternatives Considered**:
- Persist reference indexes: ❌ Stale quickly, storage bloat
- Cross-project embeddings: ❌ Confusion guaranteed

---

### ADR-011: Concept-Based Memory, NOT "Save All Responses"

**Status**: ACCEPTED

**Context**: What should be saved to memory? Options:
1. Save ALL assistant responses (like mem.ai)
2. Save only explicit "remember" commands
3. Save typed concepts (decisions, patterns, learnings)

**Decision**: Save **typed concepts**, not raw responses.

**Rationale** (Linus mode):
> *"Save ALL responses? 90% of what an AI says is 'Here's the code' or 'Let me read that file'. That's not a LEARNING, that's the conversation. You'll fill your database with megabytes of garbage and wonder why search returns 'Let me help you with that' when you ask about authentication patterns. Storage is cheap but NOISE is expensive."*

**What IS Worth Remembering**:

| Concept Type | Example | Signal |
|--------------|---------|--------|
| `decision` | "Chose Redis over Memcached because of clustering" | "decided", "chose", "because", "instead of" |
| `pattern` | "This project uses repository pattern for data access" | "pattern", "convention", "always", "in this project" |
| `constraint` | "Can't use ESM because legacy bundler" | "can't", "blocked", "requires", "must" |
| `learning` | "Tests fail without mock server running" | Passive: tool failure→success |
| `context` | "Monorepo with pnpm workspaces" | "uses", "configured with", "set up with" |
| `rule` | "Never use `any` type" | User promotes to golden rule |

**What is NOT Worth Remembering**:
- Code itself (that's what git is for)
- "Let me read that file..." (action narration)
- "Here's the implementation..." (ephemeral output)
- Error stack traces (context-dependent, stale immediately)
- Generic explanations (can be re-derived by LLM)

**Capture Mechanisms**:

```
┌─────────────────────────────────────────────────────────────────────┐
│              CONCEPT-BASED MEMORY CAPTURE                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PASSIVE (automatic, from tool outcomes):                           │
│  └── tool.execute.after hook                                        │
│      ├── Failure detected → record as `learning`                   │
│      ├── Success after failure → record as `learning` (what fixed) │
│      └── Nothing else. No "save all" garbage.                      │
│                                                                     │
│  EXPLICIT (AI/user invokes):                                        │
│  └── semanthicc remember "X" --type <decision|pattern|context|...>  │
│      ├── AI notices a decision → calls tool with --type decision   │
│      ├── User says "remember this pattern" → AI calls tool          │
│      └── Stored with type for better retrieval filtering           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Schema Addition**:
```sql
-- Add type column to memories
ALTER TABLE memories ADD COLUMN concept_type TEXT;
-- Values: 'decision', 'pattern', 'constraint', 'learning', 'context', 'rule'

-- Query by type for focused retrieval
SELECT * FROM memories 
WHERE concept_type IN ('decision', 'pattern')
AND project_id = $current_project
ORDER BY confidence DESC;
```

**Alternatives Considered**:
- Save all responses: ❌ Noise explosion, garbage retrieval
- LLM curator rates 1-10: ❌ Latency, complexity, often wrong
- 10-dimensional scoring (memory-ts): ❌ Overengineered bullshit
- End-of-session extraction only: ⚠️ Delayed, user might skip

**Scalability Note (Non-Code Domains)**:

| Domain | Passive Signals? | Capture Method |
|--------|------------------|----------------|
| Coding | ✅ Tool outcomes | Passive + explicit |
| Project Mgmt | ❌ None | Explicit only |
| Portfolio | ❌ None | Explicit only |
| Notes/PKM | ❌ None | Explicit only |

Non-code domains MUST rely on explicit "remember" commands. No passive fallback exists.

---

### ADR-012: File Exclusion Rules (Security + Performance)

**Status**: ACCEPTED

**Context**: When indexing a codebase for semantic search, which files should be excluded?

**Decision**: Respect `.gitignore` + hard-coded security/performance exclusions.

---

### ADR-013: Exact-Match Deduplication (v0.5.0)

**Status**: ACCEPTED

**Context**: Users can accidentally add the same memory multiple times ("Never use any" x10).

**Decision**: Reject exact-match duplicates on `addMemory()`. Do NOT use fuzzy/Jaccard matching.

**Rationale**:
- Exact match has zero false positives
- Fuzzy matching risks blocking legitimate similar content ("Use React Query" vs "Use React Router")
- If user wants to update, they can use `supersede`
- Simple, predictable behavior

**Alternatives Considered**:
- Jaccard similarity (80% threshold): ❌ False positive risk too high
- Semantic deduplication (embeddings): ❌ Overkill, adds complexity
- No deduplication: ❌ Allows bloat

---

### ADR-014: Passive Learning Noise Filtering (v0.5.0)

**Status**: ACCEPTED

**Context**: Passive learning captures every tool error, including transient network issues and false positives.

**Decision**: Filter out transient errors and false positives using regex patterns.

**Transient Patterns (ignored)**:
- `ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`
- `socket hang up`, `network timeout`

**False Positive Patterns (ignored)**:
- "error handling" (talking about errors, not an error)
- "fixed the error", "no errors" (success messages)

**Additional Filters**:
- `MIN_KEYWORDS: 4` (up from 3)
- `MIN_CONTENT_LENGTH: 30` (skip very short errors)

**Rationale**:
- Transient network errors teach nothing
- False positives pollute memory with non-errors
- Higher keyword threshold ensures meaningful content
- Inspired by ELF's false-positive detection patterns

---

### ADR-015: Status Command for Visibility (v0.5.0)

**Status**: ACCEPTED

**Context**: No visibility into system state (index freshness, memory counts, confidence distribution).

**Decision**: Add `semanthicc status` action that shows:
- Project name and path
- Index chunk count and last indexed time
- Memory counts by type (golden, regular, passive)
- Confidence statistics (avg, min, max)

**Rationale**:
- Observability is essential ("can't improve what you can't measure")
- CLI is sufficient (no dashboard needed)
- Inspired by `git status` - clean, actionable, focused

**Output Format**:
```
Project: my-project (/path/to/project)
Index: 1,247 chunks | Last indexed: 2h ago ✅
Memories: 12 total
  ⭐ 2 golden | 8 regular | 2 passive
  Confidence: avg 0.68 | min 0.42 | max 0.95
```

---

## PART 5: Data Model

### Core Schema

```sql
-- Project registry (enhanced for isolation)
CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT,
  type TEXT DEFAULT 'active',     -- 'active' | 'reference' | 'archived'
  is_current BOOLEAN DEFAULT FALSE,  -- Only ONE can be current at a time
  last_indexed_at TIMESTAMP,
  chunk_count INTEGER DEFAULT 0,
  heuristic_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Core memories table (unified heuristics/learnings/decisions)
CREATE TABLE memories (
  id INTEGER PRIMARY KEY,
  
  -- Concept classification (see ADR-011)
  concept_type TEXT NOT NULL,       -- 'decision', 'pattern', 'constraint', 'learning', 'context', 'rule'
  content TEXT NOT NULL,
  domain TEXT,                     -- e.g., 'typescript', 'testing', 'api', 'auth'
  
  -- Project scope: NULL = global, project_id = project-specific
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Confidence tracking
  confidence REAL DEFAULT 0.5,
  times_validated INTEGER DEFAULT 0,
  times_violated INTEGER DEFAULT 0,
  last_validated_at TIMESTAMP,
  
  -- Evolution chain
  status TEXT DEFAULT 'current',   -- current, superseded, archived, dead_end
  superseded_by INTEGER REFERENCES memories(id),
  evolved_from INTEGER REFERENCES memories(id),
  evolution_note TEXT,
  superseded_at TIMESTAMP,
  
  -- Source tracking (how was this captured?)
  source TEXT DEFAULT 'explicit',  -- 'explicit' (user/AI), 'passive' (tool outcome)
  source_session_id TEXT,          -- Session where this was captured
  source_tool TEXT,                -- Tool that triggered (for passive)
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Code embeddings (STRICT project isolation)
CREATE TABLE embeddings (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,  -- REQUIRED, never NULL
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,         -- SHA-256 of file content
  chunk_start INTEGER,             -- Line number start
  chunk_end INTEGER,               -- Line number end
  content TEXT,                    -- Chunked text content
  embedding BLOB,                  -- Binary vector (384 dimensions for MiniLM)
  
  -- Staleness tracking
  is_stale BOOLEAN DEFAULT FALSE,
  indexed_at TIMESTAMP,
  
  UNIQUE(project_id, file_path, chunk_start)
);
```

### Indexes

```sql
-- Project queries
CREATE INDEX idx_projects_type ON projects(type);
CREATE INDEX idx_projects_current ON projects(is_current);

-- Memory queries (most common access patterns)
CREATE INDEX idx_memories_status ON memories(status);
CREATE INDEX idx_memories_domain ON memories(domain);
CREATE INDEX idx_memories_project ON memories(project_id);
CREATE INDEX idx_memories_confidence ON memories(confidence DESC);
CREATE INDEX idx_memories_concept_type ON memories(concept_type);
CREATE INDEX idx_memories_source ON memories(source);

-- Composite for common query: get top memories by type for project
CREATE INDEX idx_memories_project_type ON memories(project_id, concept_type, confidence DESC);

-- Embedding queries (always project-scoped)
CREATE INDEX idx_embeddings_project ON embeddings(project_id);
CREATE INDEX idx_embeddings_file ON embeddings(file_path);
CREATE INDEX idx_embeddings_stale ON embeddings(is_stale);
CREATE INDEX idx_embeddings_hash ON embeddings(file_hash);

-- Composite for common query pattern
CREATE INDEX idx_embeddings_project_stale ON embeddings(project_id, is_stale);
```

### Evolution Chain Query

```sql
-- Recursive CTE to get full evolution chain
WITH RECURSIVE chain AS (
  -- Start with current version
  SELECT * FROM memories WHERE id = ?
  
  UNION ALL
  
  -- Walk back through evolved_from
  SELECT m.* FROM memories m
  JOIN chain c ON m.id = c.evolved_from
)
SELECT * FROM chain ORDER BY created_at ASC;
```

---

## PART 6: Staleness & Evolution Deep Dive

### Staleness Types

| What | Detection | Resolution |
|------|-----------|------------|
| Code embeddings | File hash mismatch | Re-index |
| Heuristics | Time decay | Validate or archive |
| Decisions | Explicit supersede | Chain link |
| Failures | Explicit "fixed" | Mark resolved |

### Evolution States

```
CURRENT → SUPERSEDED → ARCHIVED
                ↓
           DEAD_END (separate track)
```

### Query Routing Logic

#### History Intent Detection

```typescript
const HISTORY_PATTERNS = [
  /why (is|did|was|does)/i,
  /how did .* evolve/i,
  /history of/i,
  /did we try/i,
  /what happened to/i,
  /original(ly)?/i,
  /previous(ly)?/i,
  /before we/i,
  /used to/i,
  /changed from/i,
];

function detectHistoryIntent(query: string): boolean {
  return HISTORY_PATTERNS.some(p => p.test(query));
}
```

#### Query Routing Rules

| Intent Detected | Query Behavior |
|-----------------|----------------|
| No history intent | Return `status = 'current'` only |
| History intent | Return current + traverse `evolved_from` chain |
| Explicit `--include-history` | Force full chain traversal |

### The Quota Example (Real Scenario)

```
Day 1: "Implemented quota for OpenAI" → CURRENT
Day 3: "Refactored to multi-provider" → CURRENT
       Day 1 becomes → SUPERSEDED (evolved_from: Day 3)
```

| Query | Returns |
|-------|---------|
| "How does quota work?" | Day 3 only |
| "Why is quota so complex?" | Day 3 + chain to Day 1 |
| "Did we try single-provider?" | Day 1 as HISTORICAL |

---

## PART 7: Multi-Project Isolation (Critical Design)

### The Problem (5 Approaches Analysis)

#### First Principles

**What are we ACTUALLY trying to do?**

| Goal | Real Need |
|------|-----------|
| "Learn from other codebases" | Steal PATTERNS, not code chunks |
| "How did X solve Y?" | One-time exploration, not persistent |
| "Remember this works" | Heuristic, not embedding |
| Semantic search | ALWAYS scoped to CURRENT project |

**Key Insight**:
```
EMBEDDINGS = Current project ONLY (semantic code search)
HEURISTICS = Can be global OR project-scoped (patterns/learnings)
```

**Mixing embeddings across projects = guaranteed confusion.**

#### Inversion (What Would Fail?)

| Failure | How It Happens | Prevention |
|---------|----------------|------------|
| Cross-project embedding pollution | Query returns chunks from wrong repo | **Strict project isolation for embeddings** |
| Stale reference repos | Indexed once, never updated | **Don't persist reference embeddings** |
| Global heuristics pollution | Pattern from project A wrong for B | **Heuristics have project scope OR explicit global flag** |
| Slow queries | Searching 500k embeddings across 10 repos | **Query only active project's embeddings** |
| Storage bloat | 10 repos × 100MB each | **Ephemeral reference indexing** |

#### Analogies

| System | How It Handles Multi-Project |
|--------|------------------------------|
| **Git** | Each repo is isolated. `git remote` for references, doesn't pollute local. |
| **IDE (VSCode)** | One workspace = one project. Multi-root is explicit. |
| **Docker** | Images isolated. Layers shared, but containers separate. |
| **Serena** | `activate_project` — one at a time, explicit switch |

**Pattern**: 
```
ACTIVE PROJECT = Full read/write, persistent state
REFERENCE = Read-only, ephemeral, doesn't affect active
```

### The Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MULTI-PROJECT MEMORY MODEL                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ACTIVE PROJECT (persistent)                                        │
│  ├── Embeddings: Indexed, searchable, updated on change             │
│  ├── Heuristics: Project-specific patterns                          │
│  └── Decisions: Project-specific ADRs                               │
│                                                                     │
│  GLOBAL (persistent)                                                │
│  ├── Heuristics: Universal patterns (explicit --global)             │
│  └── Golden Rules: Constitutional, apply everywhere                 │
│                                                                     │
│  REFERENCE (ephemeral)                                              │
│  ├── Embeddings: Indexed on-demand, discarded after session         │
│  ├── Heuristics: NONE (can't learn from repos you don't own)        │
│  └── Use case: "Show me how opencode does X"                        │
│                                                                     │
│  CROSS-POLLINATION (explicit action)                                │
│  └── User explicitly: "Save this pattern from opencode as global"   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Memory Type Scoping Rules

| Memory Type | Cross-Project? | Persistence | Query Scope |
|-------------|----------------|-------------|-------------|
| **Embeddings** | ❌ NEVER | Per-project | Strict isolation |
| **Heuristics (project)** | ❌ No | Persistent | `project_id = X` |
| **Heuristics (global)** | ✅ Yes | Persistent | `project_id IS NULL` |
| **Golden Rules** | ✅ Yes | Persistent | Always injected |
| **Reference exploration** | N/A | Ephemeral | Session-only |

### Query Implementation

```typescript
// EMBEDDINGS: Always project-scoped (NEVER cross-project)
async function searchCode(query: string) {
  const currentProject = await getCurrentProject();  // From CWD
  
  if (!currentProject) {
    throw new Error("No project indexed for current directory. Run: elf index");
  }
  
  // STRICT: Only search current project's embeddings
  return db.query(`
    SELECT * FROM embeddings 
    WHERE project_id = $1 
    AND is_stale = FALSE
    ORDER BY similarity(embedding, $2) DESC
    LIMIT 5
  `, [currentProject.id, embed(query)]);
}

// HEURISTICS: Project + Global combined
async function getHeuristics(domain?: string) {
  const currentProject = await getCurrentProject();
  
  // Project-specific + Global (NULL project_id)
  return db.query(`
    SELECT *, 
      CASE WHEN project_id IS NULL THEN 'global' ELSE 'project' END as scope
    FROM memories 
    WHERE type = 'heuristic'
    AND status = 'current'
    AND (project_id = $1 OR project_id IS NULL)
    ${domain ? 'AND domain = $2' : ''}
    ORDER BY confidence DESC
    LIMIT 10
  `, [currentProject?.id, domain]);
}

// PROJECT DETECTION: From CWD
async function getCurrentProject(): Project | null {
  const cwd = process.cwd();
  
  // Find project that contains CWD
  const project = await db.query(`
    SELECT * FROM projects 
    WHERE $1 LIKE path || '%'
    AND type = 'active'
    ORDER BY LENGTH(path) DESC
    LIMIT 1
  `, [cwd]);
  
  return project || null;
}
```

### Reference Exploration Flow

```bash
# 1. User wants to explore another codebase
elf explore ~/repos/opencode
# Creates temporary in-memory index

# 2. Query within exploration session (isolated)
[explore:opencode] > how does the provider system work?
# Returns: Chunks from opencode ONLY (ephemeral index)

# 3. User finds useful pattern
[explore:opencode] > save-pattern "Providers use registry pattern with lazy init"
# Saved as GLOBAL heuristic (not opencode-specific)
# Reason: You don't own opencode, can't track validate/violate

# 4. Exit exploration
[explore:opencode] > exit
# Temporary index discarded
# Global heuristic persists

# 5. Back to normal operation
elf search "provider pattern"
# Returns: Your project's code + the global heuristic you saved
```

### Commands for Multi-Project

```bash
# List all indexed projects
elf projects list
# → /home/user/myproject (active) — 1,234 chunks, 45 heuristics
# → /home/user/work/api (active) — 5,678 chunks, 12 heuristics

# Index current directory as active project
elf index .

# Start ephemeral exploration of reference repo
elf explore ~/repos/opencode

# Within exploration, save pattern as global
[explore:opencode] > save-pattern "description" --domain X

# Heuristics commands with scope
elf heuristics-add "pattern" --domain X              # Project-specific (default)
elf heuristics-add "pattern" --domain X --global     # Explicit global
elf heuristics-list                                   # Project + global
elf heuristics-list --global-only                     # Global only
```

### Why NOT Serena-Style `activate_project`?

| Aspect | Serena | Our Approach |
|--------|--------|--------------|
| Activation | Explicit `activate_project` | Auto-detect from CWD |
| State | One project active at a time | Query-time scoping |
| Cross-project | Must switch context | `--project` flag or `explore` mode |
| Why different | LSP servers are stateful | SQLite queries are stateless |

**Serena needs activation because**: LSP servers are stateful, one language server per project, needs initialization.

**We don't need it because**:
- Embeddings stored with `project_id` → already isolated
- Heuristics have `project_id` field → can filter by path
- SQLite can query with path filter at query time
- CWD detection = zero ceremony

---

## PART 8: MVP Roadmap (Granular TODOs)

### MVP-1: Heuristics (8 hours)

- [ ] **Create SQLite schema**
  - [ ] projects table (with type, is_current)
  - [ ] memories table (with project_id FK)
  - [ ] indexes
  - [ ] migrations folder structure
- [ ] **Implement heuristics-add command**
  - [ ] Parse arguments (rule, domain, project)
  - [ ] `--global` flag for universal patterns
  - [ ] Insert to DB with correct project_id
  - [ ] Return confirmation
- [ ] **Implement heuristics-list command**
  - [ ] Query by project + global combined
  - [ ] Sort by confidence
  - [ ] Show scope (project/global) in output
  - [ ] Format output
- [ ] **Implement validate/violate commands**
  - [ ] Update counters
  - [ ] Recalculate confidence
  - [ ] Check golden promotion/demotion
- [ ] **Session start hook**
  - [ ] Detect project path from CWD
  - [ ] Query top 5 heuristics (project + global)
  - [ ] Format injection (~300 tokens)
  - [ ] Wire into OpenCode session init

### MVP-1.5: Project Isolation (3 hours)

- [ ] **Project detection**
  - [ ] `getCurrentProject()` from CWD
  - [ ] Match CWD against indexed project paths
  - [ ] Error if not in indexed project (for embedding queries)
- [ ] **Enforce embedding isolation**
  - [ ] `project_id NOT NULL` constraint on embeddings
  - [ ] All embedding queries scoped by current project
  - [ ] No `--cross-project` flag for embeddings (NEVER)
- [ ] **Implement project commands**
  - [ ] `elf projects list` — show all indexed with stats
  - [ ] `elf projects add <path>` — register project
  - [ ] `elf projects remove <path>` — unregister (cascade delete embeddings)
- [ ] **Heuristics scoping**
  - [ ] Default: project-specific
  - [ ] `--global` flag for universal patterns
  - [ ] Query returns: project + global combined
  - [ ] Output shows scope label

### MVP-2: Semantic Search (2 days)

- [ ] **Port claude-context core**
  - [ ] Embedding model loader (MiniLM)
  - [ ] File chunking logic
  - [ ] Vector storage (SQLite blob)
- [ ] **Implement index command**
  - [ ] Register project in projects table
  - [ ] Walk codebase
  - [ ] Filter by .gitignore
  - [ ] Chunk files
  - [ ] Embed and store with project_id
  - [ ] Store file hash
  - [ ] Update project chunk_count
- [ ] **Implement search command**
  - [ ] Get current project from CWD
  - [ ] ERROR if not in indexed project
  - [ ] Embed query
  - [ ] BM25 keyword score (project-scoped)
  - [ ] Cosine similarity score (project-scoped)
  - [ ] Hybrid ranking
  - [ ] Return top N chunks
- [ ] **Git hook for staleness**
  - [ ] post-commit hook script
  - [ ] Mark changed files stale (by project_id)
  - [ ] elf invalidate command
- [ ] **Lazy verification**
  - [ ] On read: check hash
  - [ ] If mismatch: exclude + queue re-index

### MVP-2.5: Reference Exploration (4 hours)

- [ ] **Ephemeral explore mode**
  - [ ] `elf explore <path>` command
  - [ ] In-memory SQLite or temp table for embeddings
  - [ ] Interactive REPL session
  - [ ] Prompt shows `[explore:reponame] >`
- [ ] **Explore session commands**
  - [ ] Search within explored repo only
  - [ ] `save-pattern "description"` → saves as GLOBAL heuristic
  - [ ] `exit` → discard ephemeral index
- [ ] **Isolation guarantees**
  - [ ] Reference embeddings never written to main DB
  - [ ] Cannot create project-specific heuristics for reference repos
  - [ ] Only global patterns can be saved

### MVP-3: Evolution Tracking (4 hours)

- [ ] **Add evolution columns to schema**
  - [ ] superseded_by FK
  - [ ] evolved_from FK
  - [ ] evolution_note TEXT
  - [ ] superseded_at TIMESTAMP
- [ ] **Implement supersede command**
  - [ ] Link old → new
  - [ ] Update status
  - [ ] Add note
- [ ] **History intent detection**
  - [ ] Regex patterns for "why", "history", etc.
  - [ ] `detectHistoryIntent()` function
- [ ] **Query routing**
  - [ ] Default: current only
  - [ ] History: chain traversal (recursive CTE)
- [ ] `--include-history` flag for commands

### MVP-4: Failure Similarity (4 hours)

- [ ] **Implement learn-failure command**
  - [ ] Store with domain, description
  - [ ] Extract keywords for matching
- [ ] **Implement learn-success command**
  - [ ] Store pattern
  - [ ] Optional: link to heuristic
- [ ] **Jaccard similarity function**
  - [ ] Extract keywords from query
  - [ ] Compare against failures
  - [ ] Threshold: 0.3
- [ ] **Auto-inject warning**
  - [ ] On session start or domain detection
  - [ ] Check for similar failures
  - [ ] Format warning (~200 tokens)
- [ ] **failure-fixed command**
  - [ ] Mark resolved
  - [ ] Optional commit link

---

## PART 9: What We're NOT Building

| Feature | Why Not | Alternative |
|---------|---------|-------------|
| Session summaries | OpenCode has session tools | Use existing |
| Emotional memory | Not coding-relevant | Skip |
| Dashboard | CLI is enough | Skip |
| Multi-agent swarm | Overkill | Skip |
| 10-dimensional scoring | Overengineering | 2 dimensions |
| External API embeddings | Cost, latency | Local model |
| Real-time file watcher | Complexity | Git hook |
| Auto-detect success/failure | Too hard | Explicit commands |
| Cross-project embedding search | Confusion guaranteed | Strict isolation |
| Persistent reference repo indexing | Stale quickly, storage bloat | Ephemeral exploration |
| Serena-style `activate_project` | Unnecessary ceremony | CWD auto-detection |

---

## APPENDIX: Reference Research

### ELF Analysis

**Source**: OpenCode's built-in ELF plugin (~5000 LOC total, core heuristics ~300 LOC)

**Key Takeaways**:

| Aspect | ELF Implementation | Our Decision |
|--------|-------------------|--------------|
| Confidence range | 0.0 - 1.0 | ✅ Steal |
| Validate/violate counters | Increment on manual feedback | ✅ Steal |
| Retrieval method | SQL `LIKE` matching (no embeddings) | ✅ Steal for heuristics |
| Time decay | 7-day half-life | ⚠️ Use 30-day (less aggressive) |
| Context tiers | Minimal (~500) → Deep (~5k tokens) | ✅ Steal concept |
| Golden rules | Manual promotion, exempt from decay | ✅ Steal |

**What to Skip**:
- Complex multi-mode retrieval (overkill for MVP)
- Learnings vs heuristics distinction (we unify into `memories` table)

---

### memory-ts Analysis

**Source**: mem0ai/mem-ts (Node.js memory framework)

**Key Takeaways**:

| Aspect | memory-ts Implementation | Our Decision |
|--------|-------------------------|--------------|
| 10-dimensional scoring | Importance, recency, relevance, etc. | ❌ Skip (overkill) |
| Local embedding model | MiniLM-L6-v2 (80MB, 384 dims) | ✅ Steal |
| Session primer | Auto-inject context on session start | ✅ We have session tools already |
| Curator importance | AI-rated importance 1-10 | ❌ Skip (use confidence instead) |
| Vector storage | SQLite blob | ✅ Steal |

**What to Skip**:
- Multi-dimensional scoring (2 dimensions enough: confidence + recency)
- Curator-based importance rating (adds latency, complexity)
- Session summarization (OpenCode already has session tools)

---

### claude-context Analysis

**Source**: anthropics/claude-code hybrid retrieval research

**Key Takeaways**:

| Aspect | claude-context Implementation | Our Decision |
|--------|------------------------------|--------------|
| Hybrid retrieval | BM25 (keyword) + cosine (vector) | ✅ Steal |
| Token reduction | Claims 40% reduction on large codebases | ✅ Goal to match |
| Merkle tree indexing | Incremental updates via content hashing | ⚠️ Maybe later (complexity) |
| File hash staleness | SHA-256 hash to detect changes | ✅ Steal |
| Chunk sizing | ~500 tokens per chunk, overlap | ✅ Steal approach |

**Hybrid Ranking Formula** (to steal):

```typescript
function hybridScore(bm25: number, cosine: number): number {
  // Normalize both to 0-1 range, then combine
  const alpha = 0.5; // Equal weight for MVP
  return alpha * bm25 + (1 - alpha) * cosine;
}
```

**What to Skip**:
- Merkle tree (adds complexity, git hook is simpler)
- Real-time file watching (git hook sufficient)

---

## Total Estimated Size

| Section | Lines |
|---------|-------|
| Executive Summary | 50 |
| Problem Analysis | 200 |
| Use Cases | 150 |
| Architecture Decisions | 300 |
| Data Model | 150 |
| Staleness & Evolution | 200 |
| MVP Roadmap | 400 |
| What We're Not Building | 50 |
| Appendix | 200 |
| **TOTAL** | **~1700 lines** |


├── DESIGN.md           ← You are here
├── src/
│   ├── index.ts
│   ├── db/
│   │   ├── schema.ts
│   │   └── migrations/
│   ├── heuristics/
│   │   ├── store.ts
│   │   ├── confidence.ts
│   │   └── inject.ts
│   ├── embeddings/
│   │   ├── index.ts
│   │   ├── search.ts
│   │   └── staleness.ts
│   ├── evolution/
│   │   ├── chain.ts
│   │   └── intent.ts
│   └── cli/
│       └── commands.ts
└── package.json


Primary Inspiration Sources

| Repo | What We're Stealing | Link |
|------|---------------------|------|
| ELF (Emergent Learning Framework) | Confidence tracking, validate/violate counters, SQL-based heuristics retrieval, time decay | [github.com/Spacehunterz/Emergent-Learning-Framework_ELF](https://github.com/Spacehunterz/Emergent-Learning-Framework_ELF) |
| claude-context | Hybrid BM25 + vector retrieval, file hash staleness, chunking strategy | [github.com/zilliztech/claude-context](https://github.com/zilliztech/claude-context) |
| memory-ts | Local MiniLM embedding model, SQLite blob storage for vectors | [github.com/RLabs-Inc/memory-ts](https://github.com/RLabs-Inc/memory-ts) |

| Resource | Why Useful |
|----------|------------|
| [mem0ai/mem0](https://github.com/mem0ai/mem0) | Original Python mem0 (memory-ts is the TS port) |
| [Zilliz Milvus docs](https://milvus.io/docs) | Vector DB concepts (we're using SQLite instead) |
| [sentence-transformers](https://www.sbert.net/) | MiniLM model documentation |

---

## Deep Dive: Inspirations Breakdown

---

### 1. ELF (Emergent Learning Framework)

**Repo**: [github.com/Spacehunterz/Emergent-Learning-Framework_ELF](https://github.com/Spacehunterz/Emergent-Learning-Framework_ELF)

#### What It Is

MCP server that gives Claude "memory" — learns from failures/successes across coding sessions.

#### Core Strategy

| Strategy | How It Works |
|----------|--------------|
| Confidence Scoring | Every heuristic starts at 0.5, goes up when validated (+0.05), down when violated (-0.1) |
| Domain Tagging | Patterns tagged by domain: debugging, testing, typescript, etc. |
| SQL Retrieval | No embeddings — uses `WHERE domain = X ORDER BY confidence DESC` |
| Time Decay | 7-day half-life — old unvalidated patterns fade |
| Golden Rules | High-confidence patterns promoted to "constitutional" — never decay |
| Tiered Context | minimal (~500 tokens) → standard (2k) → deep (5k) |

#### What Users Can Do

```bash
# Record a pattern
elf learn "Always check token expiry before debugging auth" --domain debugging

# Mark pattern as confirmed (confidence goes UP)
elf validate 42

# Mark pattern as wrong (confidence goes DOWN)  
elf violate 42

# Get relevant patterns for current task
elf query --domain debugging --limit 5

# Promote to golden rule (never decays)
elf promote 42
```

#### Data Flow

```
User makes mistake → AI fails → User says "remember this"
                                        ↓
                              elf learn "pattern" --domain X
                                        ↓
                              Stored with confidence = 0.5
                                        ↓
Next session starts → Auto-inject top heuristics for this project
                                        ↓
AI sees: "## Heuristics\n- [0.87] Always check token expiry..."
                                        ↓
                Pattern works? → elf validate → confidence = 0.92
                Pattern wrong? → elf violate → confidence = 0.77
```

#### What We're Stealing

| Feature | Why |
|---------|-----|
| Confidence 0.0-1.0 | Simple, proven, intuitive |
| Validate/violate counters | Manual feedback loop |
| SQL-based retrieval | Fast, no embeddings needed for short text |
| Domain tagging | Natural categorization |
| Golden rules | Some patterns MUST not decay |

#### What We're Skipping

| Feature | Why Skip |
|---------|----------|
| 7-day half-life | Too aggressive — using 30-day instead |
| Separate learnings vs heuristics tables | Overcomplex — we unify to `memories` |
| Dashboard UI | CLI is enough for MVP |
| Multi-agent swarm coordination | Overkill |

---

### 2. claude-context

**Repo**: [github.com/zilliztech/claude-context](https://github.com/zilliztech/claude-context)

#### What It Is

Semantic code search for Claude — indexes your codebase, answers "how does X work here?"

#### Core Strategy

| Strategy | How It Works |
|----------|--------------|
| Hybrid Retrieval | BM25 (keyword) + Cosine (vector) combined |
| Chunking | Files split into ~500 token chunks with overlap |
| File Hash Staleness | SHA-256 hash stored — if file changes, embedding is stale |
| Merkle Tree | Incremental indexing — only re-embed changed files |
| Token Reduction | Claims 40% reduction by returning only relevant chunks |

#### Why Hybrid Retrieval?

```
PURE KEYWORD (BM25):
  ✅ Exact matches: "getUserById" finds getUserById
  ❌ Misses semantics: "fetch user" won't find getUserById

PURE VECTOR (Cosine):
  ✅ Semantic: "fetch user" finds getUserById
  ❌ Misses exact: might return "getProductById" instead

HYBRID (BM25 + Cosine):
  ✅ Best of both — exact matches prioritized, semantic as fallback
```

#### Hybrid Scoring Formula

```typescript
function hybridScore(query: string, chunk: Chunk): number {
  const bm25Score = calculateBM25(query, chunk.content);    // 0-1 normalized
  const cosineScore = cosineSimilarity(embed(query), chunk.embedding);  // 0-1
  
  const alpha = 0.5;  // Equal weight for MVP
  return alpha * bm25Score + (1 - alpha) * cosineScore;
}

// Retrieval
const results = chunks
  .map(c => ({ chunk: c, score: hybridScore(query, c) }))
  .sort((a, b) => b.score - a.score)
  .slice(0, 5);  // Top 5
```

#### What Users Can Do

```bash
# Index entire codebase
claude-context index .

# Search semantically
claude-context search "how does authentication work"
# Returns: Top 5 code chunks with relevance scores

# Re-index after changes
claude-context reindex --changed-only

# Check index status
claude-context status
# Shows: 1,234 chunks indexed, 12 stale, last indexed 2h ago
```

#### Data Flow

```
Initial setup:
  Walk codebase → Filter by .gitignore → Chunk files (~500 tokens each)
        ↓
  Embed each chunk (MiniLM, 384 dimensions)
        ↓
  Store: file_path, file_hash, chunk_content, embedding_blob
        ↓
  Create BM25 index for keyword search

On query:
  User asks "how does auth work?"
        ↓
  Embed query → Cosine similarity against all chunks
        ↓
  BM25 keyword search → Score against all chunks
        ↓
  Hybrid combine → Return top 5 chunks (~1000 tokens)
        ↓
  AI sees relevant code, not entire codebase

On file change (git commit):
  Git hook → Get changed files → Mark their embeddings stale
        ↓
  Next query → Lazy re-index stale chunks OR exclude them
```

#### What We're Stealing

| Feature | Why |
|---------|-----|
| Hybrid BM25 + cosine | Covers both exact and semantic matches |
| File hash staleness | Simple, reliable change detection |
| ~500 token chunks | Good granularity for code |
| Git hook invalidation | Low overhead, integrates with workflow |

#### What We're Skipping

| Feature | Why Skip |
|---------|----------|
| Merkle tree | Complexity — git hook + hash check is simpler |
| Zilliz Cloud integration | External dependency — SQLite is enough |
| VSCode extension | Focus on CLI for MVP |
| Real-time file watcher | Resource heavy — git hook sufficient |

---

### 3. memory-ts

**Repo**: [github.com/RLabs-Inc/memory-ts](https://github.com/RLabs-Inc/memory-ts)

#### What It Is

TypeScript memory layer — remembers conversations, preferences, relationships across sessions.

#### Core Strategy

| Strategy | How It Works |
|----------|--------------|
| Local Embeddings | MiniLM-L6-v2 runs locally (80MB model, 5ms/query) |
| 10-Dimensional Scoring | Relevance calculated from 10 factors |
| Session Primer | Auto-generates context summary for session start |
| Curator AI | Uses AI to rate memory importance 1-10 |
| SQLite Storage | Vectors stored as blobs, portable, no external DB |

#### The 10 Dimensions (We're NOT Using)

```
┌────────────────────────────────────────┐
│     10-Dimensional Memory Scoring      │
├─────────────────────┬─────────┬────────┤
│ Dimension           │ Weight  │ Method │
├─────────────────────┼─────────┼────────┤
│ Vector similarity   │   10%   │ Cosine similarity │
│ Trigger phrases     │   10%   │ "when I ask about X" │
│ Tag matching        │    5%   │ Keyword overlap │
│ Question types      │    5%   │ "How/why/what" │
│ Importance          │   20%   │ Curator AI rating │
│ Temporal            │   10%   │ Persistent vs session │
│ Context             │   10%   │ Technical/personal │
│ Confidence          │   10%   │ Curator certainty │
│ Emotion             │   10%   │ Joy/frustration │
│ Problem-solution    │    5%   │ Bug fix patterns │
└─────────────────────┴─────────┴────────┘
```

#### Why We Skip This

| Reason | Explanation |
|--------|-------------|
| Overengineering | 10 dimensions for code memory is overkill |
| Curator latency | Extra AI call to rate importance = slow |
| Emotional tracking | "Joy/frustration" not relevant to code |
| Complexity | 2 dimensions (confidence + recency) is enough for MVP |

#### What Users Can Do

```typescript
// Store a memory
await memory.add({
  content: "User prefers functional programming style",
  context: "coding-preferences",
  importance: 8,
  tags: ["style", "functional"]
});

// Retrieve relevant memories
const memories = await memory.search("how should I write this function?");
// Returns: memories ranked by 10-dimensional score

// Session primer (auto-generated)
const primer = await memory.getSessionPrimer();
// Returns: "User prefers functional style, last worked on auth module..."
```

#### Embedding Model Details

```typescript
// MiniLM-L6-v2 specifics
const MODEL_INFO = {
  name: "all-MiniLM-L6-v2",
  dimensions: 384,           // Vector size
  maxTokens: 256,            // Input limit
  size: "~80MB",             // Model file
  speed: "~5ms/embedding",   // On decent CPU
  quality: "Good for code",  // Comparable to OpenAI for code similarity
  local: true                // No API calls!
};
```

#### What We're Stealing

| Feature | Why |
|---------|-----|
| MiniLM-L6-v2 model | Proven, local, fast, good for code |
| SQLite blob storage | Portable, no external deps |
| 384-dimension vectors | Standard, works well |

#### What We're Skipping

| Feature | Why Skip |
|---------|----------|
| 10-dimensional scoring | 2 dimensions enough (confidence + recency) |
| Curator AI importance | Adds latency, complexity |
| Emotional memory | Not relevant to code |
| Trigger phrases | Overcomplex for MVP |
| Session summarization | OpenCode already has session tools |

---

### Summary: What Goes Where

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FEATURE MAPPING                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  OUR SYSTEM                          SOURCE                             │
│  ──────────────────────────────────────────────────────────────────     │
│                                                                         │
│  HEURISTICS LAYER                                                       │
│  ├── Confidence 0.0-1.0              ← ELF                              │
│  ├── Validate/violate counters       ← ELF                              │
│  ├── Domain tagging                  ← ELF                              │
│  ├── Time decay (30-day)             ← ELF (modified from 7-day)        │
│  ├── Golden rules                    ← ELF                              │
│  └── SQL retrieval (no embeddings)   ← ELF                              │
│                                                                         │
│  SEMANTIC SEARCH LAYER                                                  │
│  ├── Hybrid BM25 + cosine            ← claude-context                   │
│  ├── ~500 token chunks               ← claude-context                   │
│  ├── File hash staleness             ← claude-context                   │
│  └── Git hook invalidation           ← claude-context                   │
│                                                                         │
│  EMBEDDING INFRASTRUCTURE                                               │
│  ├── MiniLM-L6-v2 (local)            ← memory-ts                        │
│  ├── 384 dimensions                  ← memory-ts                        │
│  └── SQLite blob storage             ← memory-ts                        │
│                                                                         │
│  EVOLUTION TRACKING                                                     │
│  ├── superseded_by chain             ← Our design (git-inspired)        │
│  ├── Status states                   ← Our design (ADR-inspired)        │
│  └── History intent detection        ← Our design                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Quick Reference Card

| Need | Source | Strategy |
|------|--------|----------|
| "Don't repeat mistakes" | ELF | Confidence + validate/violate |
| "Find code by meaning" | claude-context | Hybrid BM25 + cosine |
| "Run embeddings locally" | memory-ts | MiniLM-L6-v2, 80MB |
| "Detect stale embeddings" | claude-context | File hash + git hook |
| "Track decision evolution" | Our design | Linked list + status field |
| "Know when to show history" | Our design | Regex intent detection |