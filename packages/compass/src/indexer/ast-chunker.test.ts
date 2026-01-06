import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { splitIntoAstChunks, isAstChunkable, getLanguage } from "./ast-chunker";
import { splitIntoChunks } from "./chunker";
import { indexProject } from "./indexer";
import { createTestContext, type TestContext } from "../db/test-utils";
import { setTestEmbedder, createFakeEmbedding } from "../embeddings";

describe("AST Chunker - Language Detection", () => {
  const supported: [string, boolean][] = [
    ["app.ts", true],
    ["app.tsx", true],
    ["app.js", true],
    ["app.jsx", true],
    ["app.py", true],
    ["app.go", true],
    ["app.rs", true],
    ["app.java", true],
    ["App.svelte", true],
    ["app.vue", false],
    ["app.css", false],
    ["app.html", false],
    ["app.md", false],
    ["README", false],
  ];

  test.each(supported)("isAstChunkable(%s) => %s", (file, expected) => {
    expect(isAstChunkable(file)).toBe(expected);
  });

  test("getLanguage returns correct language for Svelte", () => {
    expect(getLanguage("App.svelte")).toBe("svelte");
    expect(getLanguage("Component.svelte")).toBe("svelte");
  });

  test("getLanguage returns null for unsupported", () => {
    expect(getLanguage("styles.css")).toBeNull();
    expect(getLanguage("README.md")).toBeNull();
  });
});

describe("AST Chunker - TypeScript", () => {
  test("parses class with methods", async () => {
    const code = `
export class UserService {
  async getUser(id: string) {
    return db.users.find(id);
  }
}`;
    const chunks = await splitIntoAstChunks("service.ts", code);
    
    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
    expect(chunks![0]?.contextualizedText).toBeDefined();
    expect(chunks![0]?.contextualizedText.length).toBeGreaterThan(0);
  });

  test("extracts symbol names", async () => {
    const code = `
function calculateTotal(items: Item[]) {
  return items.reduce((sum, i) => sum + i.price, 0);
}`;
    const chunks = await splitIntoAstChunks("utils.ts", code);
    
    expect(chunks).not.toBeNull();
    const hasSymbol = chunks!.some(c => c.symbol === "calculateTotal");
    expect(hasSymbol).toBe(true);
  });

  test("handles empty file", async () => {
    const chunks = await splitIntoAstChunks("empty.ts", "");
    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBe(0);
  });

  test("handles syntax errors gracefully", async () => {
    const broken = "function broken( { missing";
    const chunks = await splitIntoAstChunks("broken.ts", broken);
    expect(Array.isArray(chunks) || chunks === null).toBe(true);
  });
});

describe("AST Chunker - Svelte", () => {
  test("parses basic Svelte component", async () => {
    const code = `
<script>
  export let name = 'world';
  
  function greet() {
    alert('Hello ' + name);
  }
</script>

<h1>Hello {name}!</h1>
<button on:click={greet}>Greet</button>

<style>
  h1 { color: purple; }
</style>`;
    
    const chunks = await splitIntoAstChunks("App.svelte", code);
    
    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  test("parses Svelte with TypeScript", async () => {
    const code = `
<script lang="ts">
  interface User {
    id: string;
    name: string;
  }
  
  export let user: User;
</script>

<p>{user.name}</p>`;
    
    const chunks = await splitIntoAstChunks("User.svelte", code);
    expect(chunks).not.toBeNull();
  });

  test("parses Svelte 5 runes", async () => {
    const code = `
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
  
  function increment() {
    count++;
  }
</script>

<button onclick={increment}>{count} x 2 = {doubled}</button>`;
    
    const chunks = await splitIntoAstChunks("Counter.svelte", code);
    expect(chunks).not.toBeNull();
  });

  test("parses each/if/await blocks", async () => {
    const code = `
<script>
  let items = [];
  let promise = fetch('/api');
</script>

{#if items.length > 0}
  {#each items as item}
    <li>{item}</li>
  {/each}
{:else}
  <p>No items</p>
{/if}

{#await promise}
  <p>Loading...</p>
{:then data}
  <pre>{JSON.stringify(data)}</pre>
{:catch error}
  <p>{error.message}</p>
{/await}`;
    
    const chunks = await splitIntoAstChunks("List.svelte", code);
    expect(chunks).not.toBeNull();
  });

  test("handles empty Svelte file", async () => {
    const chunks = await splitIntoAstChunks("Empty.svelte", "");
    expect(chunks).not.toBeNull();
  });

  test("handles Svelte with only template", async () => {
    const code = `<h1>Just HTML</h1>`;
    const chunks = await splitIntoAstChunks("Simple.svelte", code);
    expect(chunks).not.toBeNull();
  });
});

describe("AST Chunker - Fallback Behavior", () => {
  test("unsupported file returns null, regex chunker works", async () => {
    const code = `
.button {
  color: blue;
}`;
    
    const astChunks = await splitIntoAstChunks("styles.css", code);
    expect(astChunks).toBeNull();
    
    const regexChunks = splitIntoChunks(code);
    expect(regexChunks.length).toBeGreaterThan(0);
  });

  test("Vue file not supported (falls back)", async () => {
    const code = `
<template>
  <div>{{ message }}</div>
</template>
<script>
export default {
  data() { return { message: 'Hello' } }
}
</script>`;
    
    const chunks = await splitIntoAstChunks("App.vue", code);
    expect(chunks).toBeNull();
  });
});

describe("AST Chunker - Contextualized Text", () => {
  test("contextualizedText includes scope for nested functions", async () => {
    const code = `
class Calculator {
  add(a: number, b: number) {
    return a + b;
  }
}`;
    
    const chunks = await splitIntoAstChunks("calc.ts", code);
    expect(chunks).not.toBeNull();
    
    const hasContext = chunks!.some(c => 
      c.contextualizedText && c.contextualizedText.length > 0
    );
    expect(hasContext).toBe(true);
  });

  test("scopeChain is populated for methods", async () => {
    const code = `
class Parent {
  child() {
    return 42;
  }
}`;
    
    const chunks = await splitIntoAstChunks("parent.ts", code);
    expect(chunks).not.toBeNull();
    
    const methodChunk = chunks!.find(c => c.symbol === "child");
    if (methodChunk) {
      expect(methodChunk.scopeChain).toBeDefined();
    }
  });
});

describe("Indexer Integration - Mixed Project", () => {
  let ctx: TestContext;
  let testDir: string;

  beforeEach(() => {
    setTestEmbedder((text) => Promise.resolve(createFakeEmbedding(text, 384)));
    ctx = createTestContext();
    testDir = join(tmpdir(), `ast-integration-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    setTestEmbedder(null);
    rmSync(testDir, { recursive: true, force: true });
    ctx.cleanup();
  });

  test("indexes mixed TS + Svelte + CSS project", async () => {
    writeFileSync(join(testDir, "api.ts"), `
export async function fetchUser(id: string) {
  return fetch('/api/users/' + id);
}`);

    writeFileSync(join(testDir, "App.svelte"), `
<script>
  import { fetchUser } from './api';
  let user = null;
</script>
<h1>{user?.name}</h1>`);

    writeFileSync(join(testDir, "styles.css"), `
.app { padding: 1rem; }
h1 { color: blue; }`);

    const result = await indexProject(ctx, testDir, { projectName: "mixed-test" });
    
    expect(result.filesIndexed).toBeGreaterThanOrEqual(2);
    expect(result.chunksCreated).toBeGreaterThan(0);
  });

  test("indexes SvelteKit project structure", async () => {
    mkdirSync(join(testDir, "src", "routes"), { recursive: true });
    mkdirSync(join(testDir, "src", "lib"), { recursive: true });

    writeFileSync(join(testDir, "src", "routes", "+page.svelte"), `
<script>
  export let data;
</script>
<h1>{data.title}</h1>`);

    writeFileSync(join(testDir, "src", "routes", "+page.server.ts"), `
export async function load() {
  return { title: 'Hello' };
}`);

    writeFileSync(join(testDir, "src", "lib", "utils.ts"), `
export function formatDate(date: Date) {
  return date.toISOString();
}`);

    const result = await indexProject(ctx, testDir, { projectName: "sveltekit-test" });
    
    expect(result.filesIndexed).toBe(3);
    expect(result.chunksCreated).toBeGreaterThan(0);
  });
});

describe("Edge Cases - Via Negativa", () => {
  test("very large Svelte file splits properly", async () => {
    const manyLines = Array(100).fill('<p>Line</p>').join('\n');
    const code = `
<script>
  let x = 1;
</script>
${manyLines}`;
    
    const chunks = await splitIntoAstChunks("Big.svelte", code, { maxChunkSize: 500 });
    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(1);
  });

  test("Svelte with special characters in expressions", async () => {
    const code = `
<script>
  let text = "Hello <world> & 'friends'";
</script>
<p>{@html text}</p>
<p>{text.replace(/</g, '&lt;')}</p>`;
    
    const chunks = await splitIntoAstChunks("Special.svelte", code);
    expect(chunks).not.toBeNull();
  });

  test("Svelte with slot and snippets", async () => {
    const code = `
<script>
  let { children } = $props();
</script>

{#snippet header()}
  <h1>Header</h1>
{/snippet}

{@render header()}
{@render children?.()}`;
    
    const chunks = await splitIntoAstChunks("Slots.svelte", code);
    expect(chunks).not.toBeNull();
  });

  test("unicode in Svelte", async () => {
    const code = `
<script>
  let 挨拶 = "こんにちは";
</script>
<p>{挨拶}</p>`;
    
    const chunks = await splitIntoAstChunks("Unicode.svelte", code);
    expect(chunks).not.toBeNull();
  });

  test("CRLF line endings", async () => {
    const code = "<script>\r\n  let x = 1;\r\n</script>\r\n<p>{x}</p>";
    const chunks = await splitIntoAstChunks("Crlf.svelte", code);
    expect(chunks).not.toBeNull();
  });
});
