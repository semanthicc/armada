# opencode-semanthicc

Semantic memory and heuristics for OpenCode - least tokens, most mistake prevention.

## MVP-1: Heuristics

Auto-inject learned patterns into system prompt. Prevents repeated mistakes.

### Features

- **Confidence tracking**: Patterns gain/lose confidence based on validate/violate
- **Time decay**: 30-day half-life for unused heuristics (golden rules exempt)
- **Project scoping**: Project-specific + global heuristics
- **Auto-injection**: Top 5 patterns injected on every message (~300 tokens)

### Installation

```bash
bun add opencode-semanthicc
```

Add to `opencode.json`:
```json
{
  "plugins": {
    "semanthicc": "./node_modules/opencode-semanthicc/dist/index.js"
  }
}
```

### Usage

```typescript
import { addMemory, validateMemory, violateMemory, listMemories, registerProject } from "opencode-semanthicc";

// Register project
const project = registerProject("/path/to/project", "My Project");

// Add a heuristic
addMemory({
  concept_type: "pattern",
  content: "Always use strict TypeScript mode",
  domain: "typescript",
  project_id: project.id, // or null for global
});

// Validate when pattern is confirmed correct
validateMemory(memoryId); // +0.05 confidence

// Violate when pattern is proven wrong  
violateMemory(memoryId); // -0.10 confidence

// List memories
const memories = listMemories({ projectId: project.id });
```

### Concept Types

| Type | Use For |
|------|---------|
| `pattern` | Recurring solutions |
| `decision` | Deliberate choices with reasoning |
| `constraint` | Limitations or requirements |
| `learning` | Discovered facts from failures |
| `context` | Project configuration |
| `rule` | Golden rules (never decay) |

### Data Location

- Linux/macOS: `~/.local/share/semanthicc/semanthicc.db`
- Windows: `%LOCALAPPDATA%\semanthicc\semanthicc.db`

## Development

```bash
bun install
bun run test      # Run tests
bun run build     # Build to dist/
bun run typecheck # Type check
```

## Roadmap

- [x] MVP-1: Heuristics (auto-inject patterns)
- [ ] MVP-2: Semantic code search (MiniLM embeddings)
- [ ] MVP-3: Knowledge evolution (supersede/archive)
- [ ] MVP-4: Passive learning (tool outcome capture)
