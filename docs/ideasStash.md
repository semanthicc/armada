Version: 1.2.1
---
Execution Order
┌─────────────────────────────────────────────────────────┐
│ Phase 1: {{TODAY}}                                      │
├─────────────────────────────────────────────────────────┤
│ 1. Add expandVariables to core.ts                       │
│ 2. Add tests for expandVariables                        │
│ 3. Integrate in index.ts                                │
│ 4. Update //patchlog to use {{TODAY}}                   │
│ 5. ✓ CHECKPOINT: Manual test                            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 2: Variable Registry                              │
├─────────────────────────────────────────────────────────┤
│ 1. Add BUILTIN_VARIABLES registry                       │
│ 2. Add context variables (PROJECT, BRANCH, USER)        │
│ 3. Add tests for registry                               │
│ 4. ✓ CHECKPOINT: Manual test                            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 3: Parameters                                     │
├─────────────────────────────────────────────────────────┤
│ 1. Update WORKFLOW_MENTION_PATTERN regex                │
│ 2. Add parseWorkflowArgs function                       │
│ 3. Update detectWorkflowMentions return type            │
│ 4. Inject args as {{args.X}} variables                  │
│ 5. Add tests                                            │
│ 6. ✓ CHECKPOINT: Manual test                            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Release                                                 │
├─────────────────────────────────────────────────────────┤
│ 1. Update patchlog.md                                   │
│ 2. Run full test suite                                  │
│ 3. Build                                                │
│ 4. Commit with version tag                              │
└─────────────────────────────────────────────────────────┘