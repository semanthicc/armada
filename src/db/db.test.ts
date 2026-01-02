import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { getDb, closeDb, resetDb } from "./index";
import { join } from "node:path";
import { unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";

function getTestDbPath(): string {
  return join(tmpdir(), `semanthicc-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

let testDbPath: string;

function cleanupTestDb(): void {
  resetDb();
  if (testDbPath && existsSync(testDbPath)) {
    try {
      unlinkSync(testDbPath);
      const walPath = `${testDbPath}-wal`;
      const shmPath = `${testDbPath}-shm`;
      if (existsSync(walPath)) unlinkSync(walPath);
      if (existsSync(shmPath)) unlinkSync(shmPath);
    } catch {
      // Ignore cleanup errors on Windows
    }
  }
}

describe("Database", () => {
  beforeEach(() => {
    testDbPath = getTestDbPath();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  test("creates database and tables", () => {
    const db = getDb(testDbPath);
    
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
    const tableNames = tables.map(t => t.name);
    
    expect(tableNames).toContain("projects");
    expect(tableNames).toContain("memories");
  });

  test("inserts and retrieves project", () => {
    const db = getDb(testDbPath);
    
    const stmt = db.prepare("INSERT INTO projects (path, name, type) VALUES (?, ?, ?) RETURNING *");
    const project = stmt.get("/test/path", "Test Project", "active") as { id: number; path: string; name: string };
    
    expect(project.id).toBe(1);
    expect(project.path).toBe("/test/path");
    expect(project.name).toBe("Test Project");
  });

  test("inserts and retrieves memory", () => {
    const db = getDb(testDbPath);
    
    const stmt = db.prepare(`
      INSERT INTO memories (concept_type, content, domain, confidence)
      VALUES (?, ?, ?, ?)
      RETURNING *
    `);
    const memory = stmt.get("pattern", "Always use strict mode", "typescript", 0.8) as {
      id: number;
      concept_type: string;
      content: string;
      confidence: number;
    };
    
    expect(memory.id).toBe(1);
    expect(memory.concept_type).toBe("pattern");
    expect(memory.content).toBe("Always use strict mode");
    expect(memory.confidence).toBe(0.8);
  });

  test("enforces concept_type constraint", () => {
    const db = getDb(testDbPath);
    
    expect(() => {
      db.exec("INSERT INTO memories (concept_type, content) VALUES ('invalid_type', 'test')");
    }).toThrow();
  });

  test("enforces confidence range constraint", () => {
    const db = getDb(testDbPath);
    
    expect(() => {
      db.exec("INSERT INTO memories (concept_type, content, confidence) VALUES ('pattern', 'test', 1.5)");
    }).toThrow();
    
    expect(() => {
      db.exec("INSERT INTO memories (concept_type, content, confidence) VALUES ('pattern', 'test', -0.1)");
    }).toThrow();
  });

  test("foreign key cascade on project delete", () => {
    const db = getDb(testDbPath);
    
    db.exec("INSERT INTO projects (path, name) VALUES ('/test', 'Test')");
    db.exec("INSERT INTO memories (concept_type, content, project_id) VALUES ('pattern', 'test', 1)");
    
    const beforeDelete = db.query("SELECT COUNT(*) as count FROM memories").get() as { count: number };
    expect(beforeDelete.count).toBe(1);
    
    db.exec("DELETE FROM projects WHERE id = 1");
    
    const afterDelete = db.query("SELECT COUNT(*) as count FROM memories").get() as { count: number };
    expect(afterDelete.count).toBe(0);
  });

  test("queries memories with project + global scope", () => {
    const db = getDb(testDbPath);
    
    db.exec("INSERT INTO projects (path, name) VALUES ('/project1', 'Project 1')");
    db.exec("INSERT INTO memories (concept_type, content, project_id, confidence) VALUES ('pattern', 'Project specific', 1, 0.7)");
    db.exec("INSERT INTO memories (concept_type, content, project_id, confidence) VALUES ('pattern', 'Global pattern', NULL, 0.9)");
    db.exec("INSERT INTO memories (concept_type, content, project_id, confidence) VALUES ('pattern', 'Other project', NULL, 0.5)");
    
    const stmt = db.prepare(`
      SELECT * FROM memories 
      WHERE concept_type IN ('pattern', 'rule', 'constraint')
      AND status = 'current'
      AND (project_id = ? OR project_id IS NULL)
      ORDER BY is_golden DESC, confidence DESC
    `);
    
    const results = stmt.all(1) as { content: string; confidence: number }[];
    
    expect(results.length).toBe(3);
    expect(results[0]?.content).toBe("Global pattern");
    expect(results[1]?.content).toBe("Project specific");
  });
});
