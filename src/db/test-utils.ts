import { Database } from "bun:sqlite";
import { join } from "node:path";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import type { SemanthiccContext } from "../context";
import { setLanceBasePath } from "../lance/connection";

function runSchema(db: Database): void {
  const schemaPath = join(import.meta.dir, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);
}

export interface TestContext extends SemanthiccContext {
  cleanup: () => void;
}

export function createTestContext(): TestContext {
  const db = new Database(":memory:");
  runSchema(db);
  
  // Setup temp LanceDB path for isolation
  const lancePath = join(tmpdir(), `semanthicc-lance-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  setLanceBasePath(lancePath);
  
  return {
    db,
    cleanup: () => {
      try {
        db.close();
      } catch {}
      try {
        rmSync(lancePath, { recursive: true, force: true });
      } catch {}
      setLanceBasePath(null);
    }
  };
}

export function clearTables(ctx: SemanthiccContext): void {
  // embeddings table removed in v0.7.0
  try { ctx.db.exec("DELETE FROM embeddings"); } catch {}
  ctx.db.exec("DELETE FROM memories");
  ctx.db.exec("DELETE FROM projects");
  try { ctx.db.exec("DELETE FROM file_hashes"); } catch {}
}
