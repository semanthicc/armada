---
description: Example workflow demonstrating on_load and captain_tool features
on_load:
  - examples/greet
---

# Example Workflow with Captain Tools

This workflow demonstrates how to use `captain_tool` with custom TypeScript tools,
and the `on_load` feature that auto-executes tools when the workflow is fetched.

## On-Load Behavior

When you call `fetch_scroll("examples/demo")`, the `examples/greet` tool runs automatically.
Its output appears in the "On-Load Results" section below.

## Available Tools

- `captain_tool("examples/greet", { name: "World" })` — Greet someone
- `captain_tool("examples/calculate", { a: 5, b: 3, op: "add" })` — Perform calculations

## Usage

1. Fetch this workflow with `fetch_scroll("examples/demo")`
2. The `on_load` tools execute automatically
3. Use `captain_tool(...)` to call additional tools

## Creating Your Own Tools

Create a `.ts` file in the `tools/` folder:

```typescript
import { defineTool } from '../../../src/captain-tool';

export default defineTool({
  description: "My custom tool",
  parameters: {
    input: { type: 'string', required: true }
  },
  execute: async ({ input }) => {
    return { result: input.toUpperCase() };
  }
});
```

Or use naked exports (simpler):

```typescript
export const description = "My simple tool";
export const parameters = { name: { type: 'string', required: true } };
export default async ({ name }) => ({ greeting: `Hello ${name}` });
```
