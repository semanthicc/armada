# Verification Guide: Semanthicc OpenCode Integration

> Step-by-step guide to verify MVP-1 (Heuristics) and MVP-2 (Semantic Search) work in OpenCode

## Prerequisites

- [ ] OpenCode installed and working
- [ ] Bun runtime installed
- [ ] This repo cloned and built (`bun run build`)

---

## Phase 1: Build Verification

### Step 1.1: Verify Build Output

```bash
cd C:\ocPlugins\repos\opencode-semanthicc
bun run build
```

**Expected**: 
- `dist/index.js` exists
- No build errors
- Output shows `1.42 MB` (includes ONNX runtime)

### Step 1.2: Verify Tests Pass

```bash
bun run test
```

**Expected**: `55 pass` (0 fail)

### Step 1.3: Verify Typecheck

```bash
bun run typecheck
```

**Expected**: No errors

---

## Phase 2: Plugin Registration

### Step 2.1: Locate OpenCode Config

Find your `opencode.json` or config location:

| Platform | Path |
|----------|------|
| Windows | `%USERPROFILE%\.config\opencode\opencode.json` |
| Linux/macOS | `~/.config/opencode/opencode.json` |

### Step 2.2: Add Plugin Entry

Add to `opencode.json`:

```json
{
  "plugins": {
    "semanthicc": {
      "path": "C:\\ocPlugins\\repos\\opencode-semanthicc\\dist\\index.js"
    }
  }
}
```

Or for development (use source directly):

```json
{
  "plugins": {
    "semanthicc": {
      "path": "C:\\ocPlugins\\repos\\opencode-semanthicc\\src\\index.ts"
    }
  }
}
```

### Step 2.3: Restart OpenCode

Close and reopen OpenCode to load the plugin.

---

## Phase 3: Heuristics Verification (MVP-1)

### Step 3.1: Add a Test Heuristic

In OpenCode, ask the AI to use the tool:

```
Use the semanthicc tool to remember this pattern: "Always use bun:sqlite instead of better-sqlite3 in this project" with domain "database"
```

**Expected**: Tool returns `{ success: true, id: 1 }`

### Step 3.2: List Heuristics

```
Use semanthicc tool to list all memories
```

**Expected**: Shows the pattern you just added with confidence `0.50`

### Step 3.3: Verify Auto-Injection

Start a **new conversation** in the same project directory.

**Expected**: The system prompt should contain:
```
<project-heuristics>
## Learned Patterns (confidence-ranked)
- [0.50] Always use bun:sqlite instead of better-sqlite3 in this project
</project-heuristics>
```

### Step 3.4: Add Global Heuristic

```
Use semanthicc to remember globally: "Never use as any in TypeScript" with type "rule"
```

**Expected**: Tool returns success, and this pattern appears with `[global]` tag in new sessions.

---

## Phase 4: Semantic Search Verification (MVP-2)

### Step 4.1: Index Current Project

```
Use semanthicc tool to index this project
```

**Expected**:
```json
{
  "success": true,
  "filesIndexed": 15,
  "chunksCreated": 25,
  "durationMs": 5000
}
```

(Numbers will vary based on project size)

### Step 4.2: Check Index Status

```
Use semanthicc tool to check status
```

**Expected**:
```json
{
  "indexed": true,
  "chunkCount": 25,
  "fileCount": 15,
  "staleCount": 0
}
```

### Step 4.3: Semantic Search

```
Use semanthicc to search for "confidence calculation decay"
```

**Expected**: Returns relevant code chunks from `src/heuristics/confidence.ts` with similarity scores.

### Step 4.4: Verify Semantic Understanding

```
Use semanthicc to search for "authentication token verification"
```

**Expected**: 
- If project has auth code → returns relevant chunks
- If no auth code → returns "No results found" or low-similarity results

---

## Phase 5: Database Verification

### Step 5.1: Locate Database

| Platform | Path |
|----------|------|
| Windows | `%LOCALAPPDATA%\semanthicc\semanthicc.db` |
| Linux/macOS | `~/.local/share/semanthicc/semanthicc.db` |

### Step 5.2: Inspect with SQLite

```bash
# Windows
sqlite3 "%LOCALAPPDATA%\semanthicc\semanthicc.db"

# Linux/macOS  
sqlite3 ~/.local/share/semanthicc/semanthicc.db
```

Run queries:
```sql
-- Check projects
SELECT id, path, name, chunk_count FROM projects;

-- Check memories (heuristics)
SELECT id, concept_type, content, confidence FROM memories;

-- Check embeddings count
SELECT project_id, COUNT(*) as chunks FROM embeddings GROUP BY project_id;
```

---

## Troubleshooting

### Plugin Not Loading

1. Check OpenCode logs for errors
2. Verify path in `opencode.json` uses correct slashes
3. Try absolute path instead of relative
4. Rebuild: `bun run build`

### Heuristics Not Injecting

1. Verify database exists at expected location
2. Check if memories exist: `SELECT * FROM memories`
3. Ensure you're in a project directory that was registered

### Search Returns No Results

1. Run `index` action first
2. Check embeddings exist: `SELECT COUNT(*) FROM embeddings`
3. Verify project_id matches current directory

### Model Loading Slow

First run downloads MiniLM model (~23MB). Subsequent runs use cache at:
- Windows: `%USERPROFILE%\.cache\huggingface`
- Linux/macOS: `~/.cache/huggingface`

---

## Verification Checklist

| # | Test | Status |
|---|------|--------|
| 1 | Build completes without errors | ⬜ |
| 2 | All 55 tests pass | ⬜ |
| 3 | Plugin loads in OpenCode | ⬜ |
| 4 | `remember` action works | ⬜ |
| 5 | `list` action shows memories | ⬜ |
| 6 | Heuristics inject in new session | ⬜ |
| 7 | `index` action indexes project | ⬜ |
| 8 | `status` shows correct counts | ⬜ |
| 9 | `search` returns relevant results | ⬜ |
| 10 | Database file exists and has data | ⬜ |

---

## Success Criteria

**MVP-1 Verified** when:
- Heuristics can be added via tool
- Heuristics auto-inject in system prompt
- Confidence visible with each memory

**MVP-2 Verified** when:
- Project can be indexed
- Semantic search returns relevant code
- Results include file paths and line numbers
