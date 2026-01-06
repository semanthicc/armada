# Example Workflow with Captain Tools

This workflow demonstrates how to use `captain_tool` with custom TypeScript tools.

## Available Tools

After loading this workflow, you can use these tools:

- `captain_tool("examples/greet", { name: "World" })` — Greet someone
- `captain_tool("examples/calculate", { a: 5, b: 3, op: "add" })` — Perform calculations

## Usage

1. First, load this workflow with `get_workflow("examples/demo")`
2. The available tools will be listed automatically
3. Use `captain_tool(...)` to execute them

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
