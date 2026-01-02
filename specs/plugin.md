# Plugin Specification

> OpenCode plugin integration pattern for Semanthicc

## Overview

Semanthicc is a **native OpenCode plugin**, not an MCP server. This provides:
- Zero IPC latency (heuristics injected on every message)
- Fewer failure modes (no separate process)
- Simpler architecture (single codebase)

## Plugin API

Based on OpenCode's plugin system (see `@opencode-ai/plugin`).

### Entry Point

```typescript
// src/index.ts
import type { Plugin } from "@opencode-ai/plugin";
import { getTopHeuristics, formatHeuristicsForInjection } from "./heuristics";
import { getCurrentProject } from "./project";
import { semanthiccTool } from "./tool";

export const SemanthiccPlugin: Plugin = async ({ directory }) => {
  return {
    name: "semanthicc",
    
    // Auto-inject heuristics into system prompt
    "experimental.chat.system.transform": async (input, output) => {
      const project = await getCurrentProject(directory);
      const heuristics = await getTopHeuristics(project?.id ?? null);
      const formatted = formatHeuristicsForInjection(heuristics);
      
      if (formatted) {
        output.system.push(formatted);
      }
    },
    
    // Learn from tool outcomes (passive capture)
    "tool.execute.after": async (input, output) => {
      // MVP-4: Record failures/successes
      // await recordToolOutcome(input.tool, output);
    },
    
    // Register semanthicc tool
    tool: {
      semanthicc: semanthiccTool
    }
  };
};

export default SemanthiccPlugin;
```

### Plugin Hooks Used

| Hook | Purpose | Frequency |
|------|---------|-----------|
| `experimental.chat.system.transform` | Inject heuristics into system prompt | Every message |
| `tool.execute.after` | Learn from tool outcomes (MVP-4) | After each tool call |

### Tool Registration

```typescript
// src/tool.ts
import type { Tool } from "@opencode-ai/plugin";

export const semanthiccTool: Tool = {
  name: "semanthicc",
  description: "Semantic code search and memory management",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["search", "remember", "forget", "list"],
        description: "Action to perform"
      },
      query: {
        type: "string",
        description: "Search query or content to remember"
      },
      type: {
        type: "string",
        enum: ["pattern", "decision", "constraint", "learning", "context"],
        description: "Type of memory (for 'remember' action)"
      },
      domain: {
        type: "string",
        description: "Domain tag (e.g., 'typescript', 'testing')"
      },
      global: {
        type: "boolean",
        description: "Make this a global memory (applies to all projects)"
      },
      id: {
        type: "number",
        description: "Memory ID (for 'forget' action)"
      }
    },
    required: ["action"]
  },
  
  async execute({ action, query, type, domain, global, id }) {
    switch (action) {
      case "search":
        // MVP-2: Semantic code search
        return { error: "Semantic search not yet implemented (MVP-2)" };
        
      case "remember":
        // Add new memory
        const memory = await addMemory({
          content: query!,
          concept_type: type ?? "pattern",
          domain,
          project_id: global ? null : getCurrentProjectId()
        });
        return { success: true, id: memory.id };
        
      case "forget":
        // Remove memory
        await deleteMemory(id!);
        return { success: true };
        
      case "list":
        // List memories
        const memories = await listMemories({ domain });
        return { memories };
        
      default:
        return { error: `Unknown action: ${action}` };
    }
  }
};
```

## Project Detection

```typescript
// src/project.ts
import { getDb } from "./db";

export async function getCurrentProject(cwd: string): Promise<Project | null> {
  const db = getDb();
  
  // Find project that contains CWD (most specific match)
  const stmt = db.prepare(`
    SELECT * FROM projects 
    WHERE ? LIKE path || '%'
    AND type = 'active'
    ORDER BY LENGTH(path) DESC
    LIMIT 1
  `);
  
  return stmt.get(cwd) as Project | null;
}

export async function registerProject(path: string, name?: string): Promise<Project> {
  const db = getDb();
  
  const stmt = db.prepare(`
    INSERT INTO projects (path, name, type)
    VALUES (?, ?, 'active')
    ON CONFLICT(path) DO UPDATE SET
      name = COALESCE(excluded.name, name),
      updated_at = unixepoch('now') * 1000
    RETURNING *
  `);
  
  return stmt.get(path, name) as Project;
}
```

## Heuristics Injection

```typescript
// src/heuristics/inject.ts
import { getDb } from "./db";
import { getEffectiveConfidence, HEURISTICS } from "./confidence";
import type { Memory } from "../types";

export async function getTopHeuristics(
  projectId: number | null,
  limit = HEURISTICS.MAX_INJECTION_COUNT
): Promise<Memory[]> {
  const db = getDb();
  
  const stmt = db.prepare(`
    SELECT * FROM memories 
    WHERE concept_type IN ('pattern', 'rule', 'constraint')
    AND status = 'current'
    AND (project_id = ? OR project_id IS NULL)
    ORDER BY is_golden DESC, confidence DESC
    LIMIT ?
  `);
  
  const memories = stmt.all(projectId, limit * 2) as Memory[];  // Fetch extra for filtering
  
  // Apply time decay and filter
  return memories
    .map(m => ({ ...m, effectiveConfidence: getEffectiveConfidence(m) }))
    .filter(m => m.effectiveConfidence > HEURISTICS.MIN_EFFECTIVE_CONFIDENCE)
    .sort((a, b) => b.effectiveConfidence - a.effectiveConfidence)
    .slice(0, limit);
}

export function formatHeuristicsForInjection(memories: Memory[]): string {
  if (memories.length === 0) return '';
  
  const lines = memories.map(m => {
    const scope = m.project_id === null ? '[global] ' : '';
    const golden = m.is_golden ? '⭐ ' : '';
    const conf = (m.effectiveConfidence ?? m.confidence).toFixed(2);
    return `- ${golden}${scope}[${conf}] ${m.content}`;
  });
  
  return `
<project-heuristics>
## Learned Patterns (confidence-ranked)
${lines.join('\n')}
</project-heuristics>
`.trim();
}
```

## Configuration

### Plugin Installation

In `opencode.json`:
```json
{
  "plugins": {
    "semanthicc": {
      "path": "~/.local/share/opencode/plugins/semanthicc"
    }
  }
}
```

Or via npm/bun:
```bash
bun add -g opencode-semanthicc
```

### Database Location

| Platform | Path |
|----------|------|
| Linux/macOS | `~/.local/share/semanthicc/semanthicc.db` |
| Windows | `%LOCALAPPDATA%\semanthicc\semanthicc.db` |

```typescript
import { homedir } from "os";
import { join } from "path";

export function getDbPath(): string {
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA || homedir(), "semanthicc", "semanthicc.db");
  }
  return join(homedir(), ".local", "share", "semanthicc", "semanthicc.db");
}
```

## Build Output

```typescript
// package.json
{
  "name": "opencode-semanthicc",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "bun build src/index.ts --outdir dist --target bun",
    "test": "bun test"
  }
}
```

## Token Budget

| Component | Tokens | Notes |
|-----------|--------|-------|
| Heuristics header | ~20 | `<project-heuristics>` wrapper |
| Per heuristic | ~50-100 | Depends on content length |
| **Max total** | **~500** | 5 heuristics × ~100 tokens |

This stays well under the 2k token budget from design.md.
