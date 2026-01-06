# Phase 1 Detailed Analysis

## Current State

### Old Modules (to be deleted)
| File | Lines | Imports From |
|------|-------|--------------|
| `src/engine.ts` | 843 | types.ts, tokenizer.ts |
| `src/storage.ts` | 176 | types.ts, engine.ts |
| `src/types.ts` | ~80 | - |

### New Modules (complete)
| Module | Files | Lines | Status |
|--------|-------|-------|--------|
| `src/core/` | 8 | ~520 | ✅ Complete |
| `src/orders/` | 7 | ~750 | ✅ Complete |

### Test Status
- 235 tests passing (using OLD imports)
- Tests import from `./engine`, `./storage`, `./types`

---

## src/index.ts Import Analysis

### Current Imports (OLD)
```typescript
import { loadConfig, loadWorkflows, getWorkflowPath, ... } from './storage';
import { findBestMatch, findAllMatches, findWorkflowByName, 
         detectWorkflowMentions, parseFrontmatter, formatSuggestion, 
         expandVariables, isOrGroup, extractWorkflowReferences,
         formatAutoApplyHint, shortId, processMessageText,
         expandWorkflowMentions, findMatchingAutoWorkflows,
         findSpawnWorkflows } from './engine';
import type { VariableResolver, AutomentionMode, ... } from './engine';
import type { Workflow, WorkflowConfig, WorkflowRef } from './types';
```

### Required Mapping (OLD → NEW)

| Old Import | New Import | From |
|------------|------------|------|
| `loadConfig` | `loadConfig` | `./core/config` |
| `loadWorkflows` | `loadOrders` | `./orders/tools` |
| `getWorkflowPath` | `getPromptPath` | `./core/storage` |
| `findBestMatch` | `findBestMatch` | `./core/matcher` |
| `findAllMatches` | `findAllMatches` | `./core/matcher` |
| `findWorkflowByName` | `findByName` | `./core/matcher` |
| `detectWorkflowMentions` | `detectOrderMentions` | `./orders/engine` |
| `parseFrontmatter` | `parseOrderFrontmatter` | `./orders/parser` |
| `formatSuggestion` | `formatSuggestion` | `./orders/automention` |
| `expandVariables` | `expandVariables` | `./core/variables` |
| `isOrGroup` | `isOrGroup` | `./core/matcher` |
| `extractWorkflowReferences` | `extractOrderReferences` | `./orders/engine` |
| `formatAutoApplyHint` | `formatAutoApplyHint` | `./orders/automention` |
| `shortId` | `shortId` | `./core/utils` |
| `processMessageText` | `processMessageText` | `./orders/engine` |
| `expandWorkflowMentions` | `expandOrderMentions` | `./orders/engine` |
| `findMatchingAutoWorkflows` | `findMatchingAutoOrders` | `./orders/automention` |
| `findSpawnWorkflows` | `findSpawnOrders` | `./orders/automention` |
| `Workflow` type | `Order` | `./orders/types` |
| `WorkflowConfig` type | `CaptainConfig` | `./core/types` |
| `WorkflowRef` type | `OrderRef` | `./orders/types` |
| `VariableResolver` type | `VariableResolver` | `./core/types` |

---

## Detailed TODO for Phase 1.15-1.17

### Phase 1.15a: Update src/index.ts imports
1. Replace imports from `./storage` with new modules
2. Replace imports from `./engine` with new modules  
3. Replace imports from `./types` with new modules
4. Add backwards-compat aliases where needed

### Phase 1.15b: Update function calls in src/index.ts
1. `loadWorkflows()` → `loadOrders()`
2. `getWorkflowPath()` → `getPromptPath(_, _, 'order', _)`
3. `findWorkflowByName()` → `findByName()`
4. `detectWorkflowMentions()` → `detectOrderMentions()`
5. `findMatchingAutoWorkflows()` → `findMatchingAutoOrders()`
6. `findSpawnWorkflows()` → `findSpawnOrders()`
7. `extractWorkflowReferences()` → `extractOrderReferences()`
8. `expandWorkflowMentions()` → `expandOrderMentions()`

### Phase 1.15c: Update type references
1. `Workflow` → `Order`
2. `WorkflowConfig` → `CaptainConfig`
3. `WorkflowRef` → `OrderRef`

### Phase 1.16: Update tests
1. Create `tests/core/` with unit tests for core modules
2. Create `tests/orders/` with unit tests for orders modules
3. Update existing tests to import from new modules
4. Ensure 235+ tests still pass

### Phase 1.17: Delete old files
1. Delete `src/engine.ts`
2. Delete `src/storage.ts`
3. Delete `src/types.ts`
4. Verify build and tests pass

---

## Phase 2 Pre-planning

### Rules Module Design
```
src/rules/
├── types.ts      # Rule interface (extends BasePrompt)
├── parser.ts     # parseRuleFrontmatter
├── engine.ts     # filterRulesByAgent, buildRulesSystemPrompt
├── tools.ts      # list_rules, create_rule, etc
├── hooks.ts      # chat.params silent injection
└── index.ts      # barrel export
```

### Key Differences (Orders vs Rules)
| Aspect | Orders | Rules |
|--------|--------|-------|
| Trigger | User types `//name` | Always injected |
| Notification | Toast shown | Silent |
| Nesting | Supports `orderInOrder` | No nesting |
| Automention | Yes | N/A |
| spawnAt | Yes | N/A |
| Hook | `chat.message` | `chat.params` |

### Rules Injection Flow
```typescript
// In chat.params hook
const rules = loadRules(projectDir);
const matchingRules = filterRulesByAgent(rules, activeAgent);
const rulesContent = buildRulesSystemPrompt(matchingRules);
params.input.systemPrompt += rulesContent;
// No toast, no notification - rules are silent
```
