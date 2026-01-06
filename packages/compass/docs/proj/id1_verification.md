# Verification Guide: Semanthicc OpenCode Integration

> Exact step-by-step verification with expected outputs for every action

---

## Quick Answers

**Q: Where is the database?**
- Windows: `C:\Users\<you>\AppData\Local\semanthicc\semanthicc.db`
- Linux/macOS: `~/.local/share/semanthicc/semanthicc.db`

**Q: How do I know heuristics are being injected?**
- Start a new conversation → check if `<project-heuristics>` block appears
- Or ask: "Show me the system prompt" (some models can reflect this)

**Q: How do I create the database?**
- It's created automatically on first tool use (remember, index, etc.)

**Q: How do I see what the AI sees?**
- The heuristics are injected silently - you'll see them affect behavior
- Use the `list` action to see what's stored

---

## TEST 1: Plugin Loading

### Step 1.1: Restart OpenCode

Close OpenCode completely, then reopen it.

### Step 1.2: Check for Errors

Look at terminal output when OpenCode starts. 

**SUCCESS**: No errors mentioning "semanthicc"
**FAILURE**: `Error loading plugin semanthicc: ...`

### Step 1.3: Verify Tool Exists

In OpenCode, type:
```
What tools do you have available?
```

**SUCCESS**: List includes `semanthicc` with actions: search, index, status, remember, forget, list
**FAILURE**: `semanthicc` not in list → plugin didn't load

---

## TEST 2: Database Creation

### Step 2.1: Check Database Doesn't Exist Yet

```powershell
# Windows PowerShell
Test-Path "$env:LOCALAPPDATA\semanthicc\semanthicc.db"
```

**Expected**: `False` (doesn't exist yet)

### Step 2.2: Trigger Database Creation

In OpenCode, say:
```
Use the semanthicc tool with action "status"
```

**Expected Output**:
```json
{
  "indexed": false,
  "message": "Project not registered"
}
```

### Step 2.3: Verify Database Created

```powershell
# Windows PowerShell
Test-Path "$env:LOCALAPPDATA\semanthicc\semanthicc.db"
dir "$env:LOCALAPPDATA\semanthicc"
```

**Expected**: 
```
True
semanthicc.db
semanthicc.db-shm  (maybe)
semanthicc.db-wal  (maybe)
```

---

## TEST 3: Remember Action (Add Heuristic)

### Step 3.1: Add Project-Specific Pattern

```
Use semanthicc tool to remember: "Always use bun:sqlite in this project" with type "pattern" and domain "database"
```

**Expected Output**:
```json
{
  "success": true,
  "id": 1
}
```

### Step 3.2: Verify in Database

```powershell
sqlite3 "$env:LOCALAPPDATA\semanthicc\semanthicc.db" "SELECT id, concept_type, content, confidence, project_id FROM memories"
```

**Expected**:
```
1|pattern|Always use bun:sqlite in this project|0.5|1
```

### Step 3.3: Add Global Pattern

```
Use semanthicc tool to remember: "Never use any type in TypeScript" with type "rule" and global true
```

**Expected Output**:
```json
{
  "success": true,
  "id": 2
}
```

### Step 3.4: Verify Global in Database

```powershell
sqlite3 "$env:LOCALAPPDATA\semanthicc\semanthicc.db" "SELECT id, content, project_id FROM memories WHERE id=2"
```

**Expected** (project_id is NULL for global):
```
2|Never use any type in TypeScript|
```

---

## TEST 4: List Action

### Step 4.1: List All Memories

```
Use semanthicc tool with action "list"
```

**Expected Output**:
```json
{
  "memories": [
    {
      "id": 1,
      "type": "pattern",
      "content": "Always use bun:sqlite in this project",
      "confidence": "0.50",
      "domain": "database",
      "isGlobal": false
    },
    {
      "id": 2,
      "type": "rule", 
      "content": "Never use any type in TypeScript",
      "confidence": "0.50",
      "domain": null,
      "isGlobal": true
    }
  ]
}
```

### Step 4.2: List with Domain Filter

```
Use semanthicc tool with action "list" and domain "database"
```

**Expected**: Only shows memories with domain "database"

---

## TEST 5: Heuristics Auto-Injection

### Step 5.1: Start New Conversation

**IMPORTANT**: Start a completely new conversation/session in OpenCode (not just a new message).

### Step 5.2: Ask AI What It Knows

```
Do you have any project-specific patterns or heuristics you should follow?
```

**SUCCESS**: AI mentions the patterns you added
**ALTERNATIVE**: AI behavior reflects the patterns even without mentioning them

### Step 5.3: Verify Injection Format

The AI receives this in system prompt (you won't see it directly):
```
<project-heuristics>
## Learned Patterns (confidence-ranked)
- [global] [0.50] Never use any type in TypeScript
- [0.50] Always use bun:sqlite in this project
</project-heuristics>
```

### Step 5.4: Test Behavioral Impact

Ask the AI to write some code:
```
Write a function to connect to SQLite database
```

**SUCCESS**: AI uses `bun:sqlite` (not `better-sqlite3`)
**FAILURE**: AI uses different library → heuristic not injected

---

## TEST 6: Index Action (Semantic Search Setup)

### Step 6.1: Index Current Project

Make sure you're in the semanthicc project directory, then:
```
Use semanthicc tool with action "index"
```

**Expected Output**:
```json
{
  "success": true,
  "filesIndexed": 17,
  "chunksCreated": 35,
  "durationMs": 8500
}
```

(Numbers vary - first run is slow due to model download)

### Step 6.2: Verify Index in Database

```powershell
sqlite3 "$env:LOCALAPPDATA\semanthicc\semanthicc.db" "SELECT COUNT(*) FROM embeddings"
```

**Expected**: Number > 0 (e.g., `35`)

### Step 6.3: Check Status

```
Use semanthicc tool with action "status"
```

**Expected Output**:
```json
{
  "indexed": true,
  "projectId": 1,
  "projectPath": "C:/ocPlugins/repos/opencode-semanthicc",
  "chunkCount": 35,
  "fileCount": 17,
  "staleCount": 0,
  "lastIndexedAt": 1735848000000
}
```

---

## TEST 7: Search Action (Semantic Search)

### Step 7.1: Basic Search

```
Use semanthicc tool with action "search" and query "confidence calculation time decay"
```

**Expected Output**:
```
**1. src/heuristics/confidence.ts** (lines 15-45, 78.5% match)
```export function getEffectiveConfidence(
  confidence: number,
  isGolden: boolean,
  ...
```
```

### Step 7.2: Search for Non-Existent Concept

```
Use semanthicc tool with action "search" and query "kubernetes deployment configuration"
```

**Expected**: Low similarity results or "No results found"

### Step 7.3: Search with Limit

```
Use semanthicc tool with action "search", query "function", and limit 3
```

**Expected**: Exactly 3 results (or fewer if not enough matches)

---

## TEST 8: Forget Action

### Step 8.1: Delete a Memory

```
Use semanthicc tool with action "forget" and id 1
```

**Expected**:
```json
{
  "success": true
}
```

### Step 8.2: Verify Deletion

```
Use semanthicc tool with action "list"
```

**Expected**: Memory with id 1 no longer appears

### Step 8.3: Try to Delete Non-Existent

```
Use semanthicc tool with action "forget" and id 999
```

**Expected**:
```json
{
  "success": false
}
```

---

## TEST 9: Edge Cases

### 9.1: Empty Project (No Files)

Create empty folder, cd into it:
```
Use semanthicc tool with action "index"
```

**Expected**:
```json
{
  "success": true,
  "filesIndexed": 0,
  "chunksCreated": 0,
  "durationMs": 50
}
```

### 9.2: Search Before Index

In a new project (not indexed):
```
Use semanthicc tool with action "search" and query "anything"
```

**Expected**:
```json
{
  "error": "Project not indexed. Run 'index' first."
}
```

### 9.3: Search Without Query

```
Use semanthicc tool with action "search"
```

**Expected**:
```json
{
  "error": "Query is required for search"
}
```

### 9.4: Remember Without Content

```
Use semanthicc tool with action "remember"
```

**Expected**:
```json
{
  "error": "Content is required for remember"
}
```

### 9.5: Very Long Content

```
Use semanthicc tool to remember: "[paste 10000 characters]" 
```

**Expected**: Works (content is stored, may be chunked in display)

### 9.6: Special Characters

```
Use semanthicc tool to remember: "Use \"quotes\" and 'apostrophes' and <tags>"
```

**Expected**: Content stored correctly with escaping

---

## TEST 10: Confidence Evolution

### 10.1: Add Test Pattern

```
Use semanthicc tool to remember: "Test pattern for confidence" with type "pattern"
```

### 10.2: Check Initial Confidence

```
Use semanthicc tool with action "list"
```

**Expected**: confidence = "0.50"

### 10.3: Validate Pattern (Not Yet Implemented in Tool)

Currently validation is only via code:
```typescript
import { validateMemory } from "opencode-semanthicc";
validateMemory(memoryId); // +0.05
```

**Future**: Add `validate` action to tool

### 10.4: Time Decay

After 30 days without validation, confidence halves.
Golden rules (`is_golden = 1`) never decay.

---

## Database Inspection Commands

### Windows PowerShell

```powershell
# Open SQLite shell
sqlite3 "$env:LOCALAPPDATA\semanthicc\semanthicc.db"

# Quick queries
.tables                                    # List tables
SELECT * FROM projects;                    # All projects
SELECT * FROM memories;                    # All heuristics
SELECT COUNT(*) FROM embeddings;           # Embedding count
SELECT file_path, COUNT(*) FROM embeddings GROUP BY file_path;  # Files indexed
```

### One-liners

```powershell
# Count memories
sqlite3 "$env:LOCALAPPDATA\semanthicc\semanthicc.db" "SELECT COUNT(*) FROM memories"

# Count embeddings by project
sqlite3 "$env:LOCALAPPDATA\semanthicc\semanthicc.db" "SELECT p.path, COUNT(e.id) FROM projects p LEFT JOIN embeddings e ON p.id = e.project_id GROUP BY p.id"

# Show all heuristics with confidence
sqlite3 "$env:LOCALAPPDATA\semanthicc\semanthicc.db" "SELECT id, concept_type, substr(content,1,50), confidence, CASE WHEN project_id IS NULL THEN 'GLOBAL' ELSE 'PROJECT' END FROM memories"
```

---

## Full Verification Checklist

| # | Test | Command | Expected | ✓ |
|---|------|---------|----------|---|
| 1 | Plugin loads | Restart OpenCode | No errors | ⬜ |
| 2 | Tool exists | "What tools?" | semanthicc listed | ⬜ |
| 3 | DB created | `status` action | Response (even if empty) | ⬜ |
| 4 | Remember works | `remember` action | `success: true, id: N` | ⬜ |
| 5 | List works | `list` action | Shows memories | ⬜ |
| 6 | Global works | `remember` with `global:true` | `isGlobal: true` in list | ⬜ |
| 7 | Injection works | New session + ask about patterns | AI knows patterns | ⬜ |
| 8 | Index works | `index` action | `filesIndexed > 0` | ⬜ |
| 9 | Status works | `status` action | Shows chunk counts | ⬜ |
| 10 | Search works | `search` action | Returns relevant code | ⬜ |
| 11 | Forget works | `forget` action | Memory removed | ⬜ |
| 12 | Error handling | Search without query | Returns error message | ⬜ |

---

## Troubleshooting

### "Tool not found"
1. Check `opencode.jsonc` has `"opencode-semanthicc"` in plugins array
2. Check `package.json` has the dependency
3. Run `bun link opencode-semanthicc` in `~/.config/opencode`
4. Restart OpenCode

### "Database not created"
1. Check write permissions to `%LOCALAPPDATA%`
2. Run any tool action to trigger creation
3. Check for errors in OpenCode output

### "Heuristics not injecting"
1. Verify memories exist: `list` action
2. Start **completely new** session (not just new message)
3. Memories must have `status = 'current'` (default)
4. Confidence must be > 0.1 after time decay

### "Search returns nothing"
1. Run `index` action first
2. Check `status` shows `chunkCount > 0`
3. Try broader query
4. Check you're in the same project directory

### "Model loading slow"
First `index` or `search` downloads MiniLM (~23MB).
Cached at: `%USERPROFILE%\.cache\huggingface\`
