# Semantic Search Specification

> MVP-2: Code search by meaning, not just text

## Overview

Semantic search uses MiniLM embeddings to find code by meaning. Query "authentication middleware" finds auth code even if it's called `verifyToken`.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEMANTIC SEARCH PIPELINE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  INDEX (one-time per project)                                    │
│  ├── Walk files (respect .gitignore + exclusions)                │
│  ├── Chunk code (512 tokens max, preserve functions)             │
│  ├── Embed chunks (MiniLM-L6-v2 → 384 dims)                      │
│  ├── Hash files (SHA-256 for staleness)                          │
│  └── Store in SQLite (project_id scoped)                         │
│                                                                  │
│  SEARCH (on-demand)                                              │
│  ├── Embed query (same model)                                    │
│  ├── Cosine similarity scan (project-scoped)                     │
│  ├── Filter stale chunks                                         │
│  └── Return top N with file paths + line numbers                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Embedding Model

| Property | Value |
|----------|-------|
| Model | `Xenova/all-MiniLM-L6-v2` |
| Dimensions | 384 |
| Runtime | `@xenova/transformers` (ONNX, runs in Bun) |
| Size | ~23MB (downloaded on first use) |
| Speed | ~10ms per chunk |

## Schema Addition

```sql
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
  is_stale INTEGER DEFAULT 0,
  indexed_at INTEGER DEFAULT (unixepoch('now') * 1000),
  
  UNIQUE(project_id, file_path, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_embeddings_project ON embeddings(project_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_file ON embeddings(project_id, file_path);
CREATE INDEX IF NOT EXISTS idx_embeddings_stale ON embeddings(project_id, is_stale);
```

## File Exclusions (ADR-012)

```typescript
export const HARD_EXCLUDE = [
  // Security
  ".env*", "*.pem", "*.key", "**/credentials*", "**/secrets*",
  
  // Git
  ".git/**",
  
  // Dependencies
  "node_modules/**", "vendor/**", "venv/**", ".venv/**",
  "__pycache__/**", ".cargo/**", "target/**",
  
  // Build outputs
  "dist/**", "build/**", ".next/**", "out/**", ".output/**",
  
  // Lock files
  "package-lock.json", "yarn.lock", "bun.lockb", "pnpm-lock.yaml",
  "Cargo.lock", "Gemfile.lock", "poetry.lock", "composer.lock",
  
  // IDE
  ".idea/**", ".vscode/**", "*.swp", "*.swo",
  
  // Binary
  "*.png", "*.jpg", "*.gif", "*.ico", "*.webp", "*.svg",
  "*.woff", "*.woff2", "*.ttf", "*.eot",
  "*.zip", "*.tar", "*.gz", "*.rar",
  "*.pdf", "*.doc", "*.docx",
  "*.mp3", "*.mp4", "*.wav", "*.avi",
  "*.exe", "*.dll", "*.so", "*.dylib",
  "*.db", "*.sqlite", "*.sqlite3",
] as const;
```

## Chunking Strategy

```typescript
interface Chunk {
  content: string;
  startLine: number;
  endLine: number;
  index: number;
}

const CHUNK_CONFIG = {
  maxTokens: 512,
  overlapTokens: 50,
  minChunkSize: 50,
} as const;
```

**Rules**:
1. Try to split on function/class boundaries (AST-aware if possible)
2. Fallback: split on blank lines or at max tokens
3. Include overlap for context continuity
4. Skip chunks smaller than minChunkSize

## Similarity Function

```typescript
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

## Search Query

```typescript
async function searchCode(
  query: string,
  projectId: number,
  limit = 5
): Promise<SearchResult[]> {
  const db = getDb();
  const queryEmbedding = await embedText(query);
  
  const stmt = db.prepare(`
    SELECT id, file_path, chunk_start, chunk_end, content, embedding
    FROM embeddings
    WHERE project_id = ? AND is_stale = 0
  `);
  
  const chunks = stmt.all(projectId);
  
  return chunks
    .map(chunk => ({
      ...chunk,
      similarity: cosineSimilarity(
        queryEmbedding,
        new Float32Array(chunk.embedding)
      ),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
```

## Tool Interface

```typescript
{
  action: "search",
  query: "authentication middleware",
  limit?: 5
}

// Returns:
{
  results: [
    {
      file: "src/middleware/auth.ts",
      lines: "45-78",
      similarity: 0.87,
      preview: "export function verifyToken(req, res, next) { ... }"
    },
    // ...
  ]
}
```

## Staleness Detection

| Trigger | Action |
|---------|--------|
| File hash mismatch | Mark chunk `is_stale = 1` |
| File deleted | Delete chunks |
| Manual invalidate | Mark by pattern |
| Reindex | Re-embed stale chunks |

## Performance Targets

| Metric | Target |
|--------|--------|
| Model load | < 2s (first time), < 100ms (cached) |
| Embed single chunk | < 20ms |
| Index 100 files | < 30s |
| Search query | < 200ms |
| Bundle size increase | < 1MB (excluding model) |
