import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdirSync, existsSync, readFileSync } from "node:fs";

let db: Database | null = null;

export function getDbPath(): string {
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
    return join(localAppData, "semanthicc", "semanthicc.db");
  }
  return join(homedir(), ".local", "share", "semanthicc", "semanthicc.db");
}

function ensureDbDir(dbPath: string): void {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function runSchema(database: Database): void {
  const schemaPath = join(import.meta.dir, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  database.exec(schema);
}

export function getDb(customPath?: string): Database {
  if (db) return db;
  
  const dbPath = customPath || getDbPath();
  ensureDbDir(dbPath);
  
  db = new Database(dbPath, { create: true });
  runSchema(db);
  
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function resetDb(): void {
  closeDb();
}
