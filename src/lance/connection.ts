import * as lancedb from "@lancedb/lancedb";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { getDbPath } from "../db";

// Cache connections to avoid reconnecting repeatedly
// Key is the full path to the project database
const connections = new Map<string, lancedb.Connection>();

let basePathOverride: string | null = null;

export function setLanceBasePath(path: string | null): void {
  basePathOverride = path;
}

export function getLanceBasePath(): string {
  if (basePathOverride) return basePathOverride;
  const dbPath = getDbPath();
  // .../semanthicc/semanthicc.db -> .../semanthicc/lance/
  return join(dirname(dbPath), "lance");
}

export async function getLanceDb(projectId: number): Promise<lancedb.Connection> {
  const basePath = getLanceBasePath();
  const projectPath = join(basePath, String(projectId));
  
  if (!existsSync(projectPath)) {
    mkdirSync(projectPath, { recursive: true });
  }
  
  if (connections.has(projectPath)) {
    return connections.get(projectPath)!;
  }
  
  const db = await lancedb.connect(projectPath);
  connections.set(projectPath, db);
  
  return db;
}

export function resetLanceConnections(): void {
  connections.clear();
}
