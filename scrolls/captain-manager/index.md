---
description: Manage workflows, rules, and crews using robust Captain Tools. Use this for complex edits or content creation.
shortcuts: [captain, cm]
tags: [create, workflow, edit, rule, crew, manage, delete, rename, list]
automention: true
---
# Captain Manager

This workflow provides **robust tools** for managing Captain resources (workflows, rules, crews). 
Use these tools instead of the CLI when dealing with complex content (multiline strings, markdown) to avoid shell quoting issues.

## Resource Management (Workflows/Rules/Crews)

- `captain_tool("captain-manager/resource_list", { type?, tag?, folder? })`
  - List available items with optional filtering
  
- `captain_tool("captain-manager/resource_read", { name, type? })`
  - Read the full content of an item (including frontmatter)
  
- `captain_tool("captain-manager/resource_create", { type, name, content, force? })`
  - Create a new item. `content` must include full frontmatter + body.
  
- `captain_tool("captain-manager/resource_update", { name, content, type? })`
  - Update an existing item's content.
  
- `captain_tool("captain-manager/resource_delete", { name, type? })`
  - Delete an item.

## Tool Management (Code Tools)

- `captain_tool("captain-manager/tool_list", { target })`
  - List custom tools in a workflow/category

- `captain_tool("captain-manager/tool_create", { target, name, description, parameters, code, force? })`
  - Create a custom tool. Auto-generates TypeScript code.

- `captain_tool("captain-manager/tool_update", { target, name, description, parameters, code })`
  - Update an existing tool (full rewrite).

- `captain_tool("captain-manager/tool_read", { target, name })`
  - Read tool source code.

- `captain_tool("captain-manager/tool_delete", { target, name })`
  - Delete a tool.

## Examples

### 1. List Workflows
```javascript
captain_tool("captain-manager/resource_list", { type: "workflow" })
```

### 2. Create a Custom Tool
```javascript
captain_tool("captain-manager/tool_create", {
  target: "marketing",
  name: "fetch-data",
  description: "Fetch data from API",
  parameters: {
    url: { type: "string", required: true },
    method: { type: "string", default: "GET" }
  },
  code: `
    const response = await fetch(args.url, { method: args.method });
    return await response.json();
  `
})
```

### 3. Read a Workflow
```javascript
captain_tool("captain-manager/resource_read", { name: "marketing/research" })
```

### 4. Create a Complex Workflow
```javascript
captain_tool("captain-manager/resource_create", {
  type: "workflow",
  name: "code-review",
  content: `---
description: Review code standards
tags: [review, git]
---
# Code Review Workflow

1. Check formatting
2. Check logic
3. Run tests`
})
```

### 5. Update Content
```javascript
captain_tool("captain-manager/resource_update", {
  name: "code-review",
  content: `---
description: Updated description
---
# New Content...`
})
```

## When to use CLI vs Tools

| Task | Preferred Method | Why? |
|------|------------------|------|
| **Listing** | CLI (`captain list`) | Faster output |
| **Simple Create** | CLI (`captain create ...`) | Quick for one-liners |
| **Complex Create** | **Tools** (`resource_create`) | Handles newlines/quotes safely |
| **Editing** | **Tools** (`resource_update`) | Safer content handling |
| **Deleting** | CLI (`captain delete`) | Simple |

## CLI Quick Reference
If you prefer CLI for simple tasks:
`captain <command> <type> <name> [options]`
