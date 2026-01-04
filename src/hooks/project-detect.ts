import { getDb } from "../db";
import type { SemanthiccContext } from "../context";
import type { Project } from "../types";

function getLegacyContext(): SemanthiccContext {
  return { db: getDb() };
}

export function getCurrentProject(ctxOrCwd: SemanthiccContext | string, cwd?: string): Project | null {
  const ctx = cwd ? (ctxOrCwd as SemanthiccContext) : getLegacyContext();
  const cwdPath = cwd ?? (ctxOrCwd as string);
  
  const normalizedCwd = cwdPath.replace(/\\/g, "/");
  
  const stmt = ctx.db.prepare(`
    SELECT * FROM projects 
    WHERE ? LIKE REPLACE(path, '\\', '/') || '%'
    AND type = 'active'
    ORDER BY LENGTH(path) DESC
    LIMIT 1
  `);
  
  return stmt.get(normalizedCwd) as Project | null;
}

export function registerProject(ctxOrPath: SemanthiccContext | string, pathOrName?: string, name?: string): Project {
  let ctx: SemanthiccContext;
  let projectPath: string;
  let projectName: string | undefined;
  
  if (typeof ctxOrPath === "string") {
    ctx = getLegacyContext();
    projectPath = ctxOrPath;
    projectName = pathOrName;
  } else {
    ctx = ctxOrPath;
    projectPath = pathOrName!;
    projectName = name;
  }
  
  const normalizedPath = projectPath.replace(/\\/g, "/");
  
  const stmt = ctx.db.prepare(`
    INSERT INTO projects (path, name, type)
    VALUES (?, ?, 'active')
    ON CONFLICT(path) DO UPDATE SET
      name = COALESCE(excluded.name, name),
      updated_at = unixepoch('now') * 1000
    RETURNING *
  `);
  
  return stmt.get(normalizedPath, projectName ?? null) as Project;
}

export function listProjects(ctx?: SemanthiccContext): Project[] {
  const context = ctx ?? getLegacyContext();
  const stmt = context.db.prepare("SELECT * FROM projects ORDER BY updated_at DESC");
  return stmt.all() as Project[];
}
