import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdirSync, existsSync, readFileSync } from "node:fs";

let db: Database | null = null;
let currentDbPath: string | null = null;

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
  
  // Migration: add keywords column if missing (v0.4.0)
  const columns = database.prepare("PRAGMA table_info(memories)").all() as { name: string }[];
  const hasKeywords = columns.some(col => col.name === "keywords");
  if (!hasKeywords) {
    database.exec("ALTER TABLE memories ADD COLUMN keywords TEXT");
  }
}

export function getDb(customPath?: string): Database {
  // If no custom path specified and we already have a DB open, return it
  // This prevents tests from accidentally switching back to production DB
  if (!customPath && db) {
    return db;
  }
  
  const dbPath = customPath || getDbPath();

  if (db) {
    if (currentDbPath === dbPath) return db;
    db.close();
  }
  
  ensureDbDir(dbPath);
  
  db = new Database(dbPath, { create: true });
  currentDbPath = dbPath;
  runSchema(db);
  
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    currentDbPath = null;
  }
}

export function resetDb(): void {
  closeDb();
}

export function clearAllTables(database?: Database): void {
  const target = database || db;
  if (!target) return;
  // embeddings table removed in v0.7.0
  try { target.exec("DELETE FROM embeddings"); } catch {} 
  target.exec("DELETE FROM memories"); 
  target.exec("DELETE FROM projects");
  try { target.exec("DELETE FROM file_hashes"); } catch {}
}
