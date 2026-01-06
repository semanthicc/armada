import { getDb } from "../db";
import type { SemanthiccContext } from "../context";

function getLegacyContext(): SemanthiccContext {
  return { db: getDb() };
}

export interface FileHash {
  id: number;
  project_id: number;
  file_path: string;
  file_hash: string;
  last_indexed_at: number;
}

export function getFileHash(
  ctxOrProjectId: SemanthiccContext | number,
  projectIdOrPath?: number | string,
  filePath?: string
): string | null {
  let ctx: SemanthiccContext;
  let pid: number;
  let path: string;

  if (typeof ctxOrProjectId === "number") {
    ctx = getLegacyContext();
    pid = ctxOrProjectId;
    path = projectIdOrPath as string;
  } else {
    ctx = ctxOrProjectId;
    pid = projectIdOrPath as number;
    path = filePath!;
  }

  const result = ctx.db.query(
    "SELECT file_hash FROM file_hashes WHERE project_id = ? AND file_path = ?"
  ).get(pid, path) as { file_hash: string } | null;

  return result?.file_hash ?? null;
}

export function updateFileHash(
  ctxOrProjectId: SemanthiccContext | number,
  projectIdOrPath?: number | string,
  pathOrHash?: string,
  hash?: string
): void {
  let ctx: SemanthiccContext;
  let pid: number;
  let path: string;
  let newHash: string;

  if (typeof ctxOrProjectId === "number") {
    ctx = getLegacyContext();
    pid = ctxOrProjectId;
    path = projectIdOrPath as string;
    newHash = pathOrHash as string;
  } else {
    ctx = ctxOrProjectId;
    pid = projectIdOrPath as number;
    path = pathOrHash as string;
    newHash = hash!;
  }

  ctx.db.run(`
    INSERT INTO file_hashes (project_id, file_path, file_hash, last_indexed_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(project_id, file_path) DO UPDATE SET
      file_hash = excluded.file_hash,
      last_indexed_at = excluded.last_indexed_at
  `, [pid, path, newHash, Date.now()]);
}

export function deleteFileHash(
  ctxOrProjectId: SemanthiccContext | number,
  projectIdOrPath?: number | string,
  filePath?: string
): void {
  let ctx: SemanthiccContext;
  let pid: number;
  let path: string;

  if (typeof ctxOrProjectId === "number") {
    ctx = getLegacyContext();
    pid = ctxOrProjectId;
    path = projectIdOrPath as string;
  } else {
    ctx = ctxOrProjectId;
    pid = projectIdOrPath as number;
    path = filePath!;
  }

  ctx.db.run("DELETE FROM file_hashes WHERE project_id = ? AND file_path = ?", [pid, path]);
}

export function getAllFileHashes(
  ctxOrProjectId: SemanthiccContext | number,
  projectId?: number
): Map<string, string> {
  let ctx: SemanthiccContext;
  let pid: number;

  if (typeof ctxOrProjectId === "number") {
    ctx = getLegacyContext();
    pid = ctxOrProjectId;
  } else {
    ctx = ctxOrProjectId;
    pid = projectId!;
  }

  const results = ctx.db.query(
    "SELECT file_path, file_hash FROM file_hashes WHERE project_id = ?"
  ).all(pid) as { file_path: string; file_hash: string }[];

  const map = new Map<string, string>();
  for (const row of results) {
    map.set(row.file_path, row.file_hash);
  }
  return map;
}
