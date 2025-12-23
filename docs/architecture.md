```
┌────────────────────────────────────────────────────────────────┐
│                        NEW STRUCTURE                           │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  src/types.ts ───────────────────────────────────────────────  │
│  │  • TagOrGroup, TagEntry                                    │
│  │  • Workflow, WorkflowConfig, WorkflowRef                   │
│  │  • AutoworkflowMode, WorkflowInWorkflowMode                │
│  │  • NO LOGIC, JUST TYPES                                    │
│  └────────────────────────────────────────────────────────────  │
│                          ↑                                     │
│           ┌──────────────┼──────────────┐                      │
│           │              │              │                      │
│  src/engine.ts     src/storage.ts   src/index.ts               │
│  (was core.ts)     (NEW)            (SLIMMED)                  │
│  │                 │                │                          │
│  │ PURE LOGIC      │ DIRTY I/O      │ GLUE ONLY               │
│  │ • parseTagsField│ • loadConfig   │ • Plugin setup          │
│  │ • parseFrontmatter • loadWorkflows • Event handlers        │
│  │ • findMatching  │ • saveConfig   │ • Tool definitions      │
│  │ • processMessage│ • getPath      │ • Calls engine          │
│  │ • expandNested  │                │ • Calls storage         │
│  │ • NO fs import! │ • fs, path     │                          │
│  └─────────────────┴────────────────┴──────────────────────────│
│                                                                │                                                       │
│  tests/                                                        │
│  │  engine.test.ts (was core.test.ts)                         │
│  │  index.test.ts (updated imports)                           │
│  └────────────────────────────────────────────────────────────  │
└────────────────────────────────────────────────────────────────┘
```