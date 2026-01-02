import { getDb } from "../db";
import type { Project } from "../types";

export function getCurrentProject(cwd: string): Project | null {
  const db = getDb();
  
  const normalizedCwd = cwd.replace(/\\/g, "/");
  
  const stmt = db.prepare(`
    SELECT * FROM projects 
    WHERE ? LIKE REPLACE(path, '\\', '/') || '%'
    AND type = 'active'
    ORDER BY LENGTH(path) DESC
    LIMIT 1
  `);
  
  return stmt.get(normalizedCwd) as Project | null;
}

export function registerProject(path: string, name?: string): Project {
  const db = getDb();
  
  const normalizedPath = path.replace(/\\/g, "/");
  
  const stmt = db.prepare(`
    INSERT INTO projects (path, name, type)
    VALUES (?, ?, 'active')
    ON CONFLICT(path) DO UPDATE SET
      name = COALESCE(excluded.name, name),
      updated_at = unixepoch('now') * 1000
    RETURNING *
  `);
  
  return stmt.get(normalizedPath, name ?? null) as Project;
}

export function listProjects(): Project[] {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM projects ORDER BY updated_at DESC");
  return stmt.all() as Project[];
}
