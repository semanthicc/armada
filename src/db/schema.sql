-- Semanthicc SQLite Schema
-- Using bun:sqlite (native Bun SQLite)

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  name TEXT,
  type TEXT DEFAULT 'active' CHECK(type IN ('active', 'reference', 'archived')),
  last_indexed_at INTEGER,
  chunk_count INTEGER DEFAULT 0,
  memory_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch('now') * 1000),
  updated_at INTEGER DEFAULT (unixepoch('now') * 1000)
);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concept_type TEXT NOT NULL CHECK(concept_type IN ('pattern', 'decision', 'constraint', 'learning', 'context', 'rule')),
  content TEXT NOT NULL,
  domain TEXT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  confidence REAL DEFAULT 0.5 CHECK(confidence >= 0.0 AND confidence <= 1.0),
  times_validated INTEGER DEFAULT 0 CHECK(times_validated >= 0),
  times_violated INTEGER DEFAULT 0 CHECK(times_violated >= 0),
  is_golden INTEGER DEFAULT 0 CHECK(is_golden IN (0, 1)),
  last_validated_at INTEGER,
  status TEXT DEFAULT 'current' CHECK(status IN ('current', 'superseded', 'archived', 'dead_end')),
  superseded_by INTEGER REFERENCES memories(id),
  evolved_from INTEGER REFERENCES memories(id),
  evolution_note TEXT,
  superseded_at INTEGER,
  source TEXT DEFAULT 'explicit' CHECK(source IN ('explicit', 'passive', 'supersede')),
  source_session_id TEXT,
  source_tool TEXT,
  created_at INTEGER DEFAULT (unixepoch('now') * 1000),
  updated_at INTEGER DEFAULT (unixepoch('now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(type);
CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);

CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
CREATE INDEX IF NOT EXISTS idx_memories_domain ON memories(domain);
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_confidence ON memories(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_memories_concept_type ON memories(concept_type);
CREATE INDEX IF NOT EXISTS idx_memories_project_type_conf ON memories(project_id, concept_type, confidence DESC);

CREATE TABLE IF NOT EXISTS embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_start INTEGER NOT NULL,
  chunk_end INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding BLOB NOT NULL,
  is_stale INTEGER DEFAULT 0 CHECK(is_stale IN (0, 1)),
  indexed_at INTEGER DEFAULT (unixepoch('now') * 1000),
  
  UNIQUE(project_id, file_path, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_embeddings_project ON embeddings(project_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_file ON embeddings(project_id, file_path);
CREATE INDEX IF NOT EXISTS idx_embeddings_stale ON embeddings(project_id, is_stale);
