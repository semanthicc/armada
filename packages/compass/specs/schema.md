# Schema Specification

> SQLite schema for Semanthicc using `bun:sqlite` (native Bun SQLite)

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Unified `memories` table** | Single table for patterns, decisions, constraints, learnings (vs ELF's separate tables) |
| **`concept_type` field** | Discriminator: `pattern`, `decision`, `constraint`, `learning`, `context`, `rule` |
| **`project_id` nullable** | NULL = global, value = project-specific |
| **`bun:sqlite`** | Zero dependencies, native performance, built into Bun runtime |

## Tables

### `projects`

Registry of indexed projects. Used for embedding isolation and heuristic scoping.

```sql
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,           -- Absolute path to project root
  name TEXT,                           -- Human-friendly name (optional)
  type TEXT DEFAULT 'active',          -- 'active' | 'reference' | 'archived'
  last_indexed_at INTEGER,             -- Unix timestamp (milliseconds)
  chunk_count INTEGER DEFAULT 0,       -- Number of code chunks indexed
  memory_count INTEGER DEFAULT 0,      -- Number of memories for this project
  created_at INTEGER DEFAULT (unixepoch('now') * 1000),
  updated_at INTEGER DEFAULT (unixepoch('now') * 1000)
);
```

### `memories`

Unified table for all memory types (heuristics, patterns, decisions, learnings).

```sql
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Classification
  concept_type TEXT NOT NULL,          -- 'pattern' | 'decision' | 'constraint' | 'learning' | 'context' | 'rule'
  content TEXT NOT NULL,               -- The actual memory content
  domain TEXT,                         -- Domain tag: 'typescript', 'testing', 'auth', etc.
  
  -- Project scope: NULL = global, value = project-specific
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Confidence tracking
  confidence REAL DEFAULT 0.5,         -- 0.0 to 1.0
  times_validated INTEGER DEFAULT 0,   -- How many times confirmed correct
  times_violated INTEGER DEFAULT 0,    -- How many times proven wrong
  is_golden INTEGER DEFAULT 0,         -- 1 = exempt from time decay (promoted rule)
  last_validated_at INTEGER,           -- Unix timestamp of last validation
  
  -- Evolution chain (MVP-3)
  status TEXT DEFAULT 'current',       -- 'current' | 'superseded' | 'archived' | 'dead_end'
  superseded_by INTEGER REFERENCES memories(id),
  evolved_from INTEGER REFERENCES memories(id),
  evolution_note TEXT,
  superseded_at INTEGER,
  
  -- Source tracking
  source TEXT DEFAULT 'explicit',      -- 'explicit' (user/AI) | 'passive' (tool outcome)
  source_session_id TEXT,              -- Session where captured
  source_tool TEXT,                    -- Tool that triggered (for passive)
  
  -- Timestamps
  created_at INTEGER DEFAULT (unixepoch('now') * 1000),
  updated_at INTEGER DEFAULT (unixepoch('now') * 1000)
);
```

### `embeddings` (MVP-2)

Code embeddings for semantic search. **STRICT project isolation** - never cross-project queries.

```sql
CREATE TABLE IF NOT EXISTS embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,  -- REQUIRED, never NULL
  file_path TEXT NOT NULL,             -- Relative path from project root
  file_hash TEXT NOT NULL,             -- SHA-256 of file content (staleness detection)
  chunk_start INTEGER,                 -- Line number start
  chunk_end INTEGER,                   -- Line number end
  content TEXT,                        -- Chunked text content
  embedding BLOB,                      -- Binary vector (384 dimensions for MiniLM)
  
  is_stale INTEGER DEFAULT 0,          -- 1 = needs re-indexing
  indexed_at INTEGER,                  -- Unix timestamp
  
  UNIQUE(project_id, file_path, chunk_start)
);
```

## Indexes

```sql
-- Projects
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(type);
CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);

-- Memories (most common access patterns)
CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
CREATE INDEX IF NOT EXISTS idx_memories_domain ON memories(domain);
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_confidence ON memories(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_memories_concept_type ON memories(concept_type);

-- Composite for common query: get top memories for project
CREATE INDEX IF NOT EXISTS idx_memories_project_type_conf 
  ON memories(project_id, concept_type, confidence DESC);

-- Embeddings (always project-scoped)
CREATE INDEX IF NOT EXISTS idx_embeddings_project ON embeddings(project_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_file ON embeddings(file_path);
CREATE INDEX IF NOT EXISTS idx_embeddings_stale ON embeddings(is_stale);
CREATE INDEX IF NOT EXISTS idx_embeddings_project_stale ON embeddings(project_id, is_stale);
```

## Key Queries

### Get top heuristics (project + global)

```sql
SELECT *, 
  CASE WHEN project_id IS NULL THEN 'global' ELSE 'project' END as scope
FROM memories 
WHERE concept_type IN ('pattern', 'rule', 'constraint')
AND status = 'current'
AND (project_id = ? OR project_id IS NULL)
ORDER BY 
  is_golden DESC,           -- Golden rules first
  confidence DESC           -- Then by confidence
LIMIT 5;
```

### Detect project from CWD

```sql
SELECT * FROM projects 
WHERE ? LIKE path || '%'    -- CWD starts with project path
AND type = 'active'
ORDER BY LENGTH(path) DESC  -- Most specific match
LIMIT 1;
```

### Update confidence on validate

```sql
UPDATE memories 
SET 
  times_validated = times_validated + 1,
  confidence = MIN(1.0, confidence + 0.05),
  last_validated_at = unixepoch('now') * 1000,
  updated_at = unixepoch('now') * 1000
WHERE id = ?;
```

### Update confidence on violate

```sql
UPDATE memories 
SET 
  times_violated = times_violated + 1,
  confidence = MAX(0.0, confidence - 0.1),
  updated_at = unixepoch('now') * 1000
WHERE id = ?;
```

## bun:sqlite Usage

```typescript
import { Database } from "bun:sqlite";

// Singleton pattern
let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    const dbPath = getDbPath(); // ~/.local/share/semanthicc/semanthicc.db
    db = new Database(dbPath, { create: true });
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

## Data Location

```
~/.local/share/semanthicc/
├── semanthicc.db          # Main SQLite database
├── semanthicc.db-wal      # WAL journal
└── semanthicc.db-shm      # Shared memory
```

Windows: `%LOCALAPPDATA%\semanthicc\`
