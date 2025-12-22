# ID13: Reactivation Optimizations - Same-Message Deduplication

## Problem Statement

When a single message contains the **same workflow multiple times**:
```
Review this code //linus-torvalds and then apply //linus-torvalds again
```

**Previous behavior:** Both mentions were fully expanded, causing context bloat.
**Fixed behavior:** 
1. First `//linus-torvalds` → Full expansion (`<workflow>...</workflow>`)
2. Second `//linus-torvalds` → Reference (`[use_workflow:linus-torvalds-id]`)

## Implementation Details

Modified `src/index.ts` to change replacement logic:
- Instead of `replace(globalPattern, fullContent)` which replaced ALL occurrences...
- We now use:
  1. `replace(firstPattern, fullContent)` for the first match
  2. `replace(remainingPattern, referenceTag)` for all subsequent matches

## Tag Naming
Changed reference tag from `[workflow:...]` to `[use_workflow:...]` to be more explicit about intent.

## Configuration

Added `~/.config/opencode/workflows.json` configuration file:
```json
{
  "deduplicateSameMessage": true
}
```

- **`deduplicateSameMessage`** (default: `true`): When enabled, duplicate workflow mentions in the same message are converted to references. Set to `false` to fully expand all occurrences (old behavior).
- The config file is auto-created on first run with default values.

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| `//foo //bar` | Both fully expand (different workflows) |
| `//foo //foo` | First expands, second references (when dedup enabled) |
| `//foo(a=1) //foo(a=2)` | Both fully expand (different args = different invocations) |
| `//foo! //foo` | First expands (force), second references |

## Files Modified

- `src/index.ts` - Added `loadConfig()`, `WorkflowConfig` interface, updated `expandWorkflowMentions()` and `chat.message` handler
- `tests/index.test.ts` - Added tests for config loading and deduplication logic

## Status
- [x] Spec defined
- [x] Implementation completed
- [x] Verified logic
- [x] Renamed tag to `[use_workflow:...]`
- [x] Added configuration option
- [x] Tests created and passing (109 tests)
