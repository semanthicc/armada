import { Database } from "bun:sqlite";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import type { SemanthiccContext } from "../context";

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
  
  return {
    db,
    cleanup: () => {
      try {
        db.close();
      } catch {}
    }
  };
}

export function clearTables(ctx: SemanthiccContext): void {
  ctx.db.exec("DELETE FROM embeddings");
  ctx.db.exec("DELETE FROM memories");
  ctx.db.exec("DELETE FROM projects");
}
