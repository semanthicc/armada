import { getDb } from "../db";
import type { Memory, CreateMemoryInput, MemoryWithEffectiveConfidence } from "../types";
import {
  HEURISTICS,
  getEffectiveConfidence,
  calculateValidatedConfidence,
  calculateViolatedConfidence,
  shouldPromoteToGolden,
  shouldDemoteFromGolden,
} from "./confidence";

export function addMemory(input: CreateMemoryInput): Memory {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO memories (concept_type, content, domain, project_id, source, source_session_id, source_tool)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `);

  return stmt.get(
    input.concept_type,
    input.content,
    input.domain ?? null,
    input.project_id ?? null,
    input.source ?? "explicit",
    input.source_session_id ?? null,
    input.source_tool ?? null
  ) as Memory;
}

export function getMemory(id: number): Memory | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM memories WHERE id = ?");
  return stmt.get(id) as Memory | null;
}

export function deleteMemory(id: number): boolean {
  const db = getDb();
  const stmt = db.prepare("DELETE FROM memories WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

export function listMemories(options: {
  projectId?: number | null;
  domain?: string;
  conceptTypes?: string[];
  includeGlobal?: boolean;
  includeHistory?: boolean;
  limit?: number;
}): MemoryWithEffectiveConfidence[] {
  const db = getDb();
  const {
    projectId = null,
    domain,
    conceptTypes = ["pattern", "rule", "constraint"],
    includeGlobal = true,
    includeHistory = false,
    limit = HEURISTICS.MAX_INJECTION_COUNT,
  } = options;

  let sql = `
    SELECT * FROM memories 
    WHERE concept_type IN (${conceptTypes.map(() => "?").join(", ")})
  `;
  const params: (string | number | null)[] = [...conceptTypes];

  if (!includeHistory) {
    sql += " AND status = 'current'";
  }

  if (projectId !== null) {
    if (includeGlobal) {
      sql += " AND (project_id = ? OR project_id IS NULL)";
    } else {
      sql += " AND project_id = ?";
    }
    params.push(projectId);
  } else if (includeGlobal) {
    sql += " AND project_id IS NULL";
  }

  if (domain) {
    sql += " AND domain = ?";
    params.push(domain);
  }

  sql += " ORDER BY is_golden DESC, confidence DESC";
  sql += ` LIMIT ${limit * 2}`;

  const stmt = db.prepare(sql);
  const memories = stmt.all(...params) as Memory[];

  return memories
    .map((m) => ({
      ...m,
      is_golden: Boolean(m.is_golden),
      effectiveConfidence: getEffectiveConfidence(
        m.confidence,
        Boolean(m.is_golden),
        m.last_validated_at,
        m.created_at
      ),
    }))
    .filter((m) => m.effectiveConfidence > HEURISTICS.MIN_EFFECTIVE_CONFIDENCE)
    .sort((a, b) => b.effectiveConfidence - a.effectiveConfidence)
    .slice(0, limit);
}

export function validateMemory(id: number): Memory | null {
  const db = getDb();
  const memory = getMemory(id);
  if (!memory) return null;

  const newConfidence = calculateValidatedConfidence(memory.confidence);
  const newTimesValidated = memory.times_validated + 1;
  const promoteToGolden = shouldPromoteToGolden(
    newConfidence,
    newTimesValidated,
    memory.times_violated
  );

  const stmt = db.prepare(`
    UPDATE memories SET
      times_validated = ?,
      confidence = ?,
      is_golden = ?,
      last_validated_at = ?,
      updated_at = ?
    WHERE id = ?
    RETURNING *
  `);

  const now = Date.now();
  return stmt.get(
    newTimesValidated,
    newConfidence,
    promoteToGolden ? 1 : (memory.is_golden ? 1 : 0),
    now,
    now,
    id
  ) as Memory;
}

export function violateMemory(id: number): Memory | null {
  const db = getDb();
  const memory = getMemory(id);
  if (!memory) return null;

  const newConfidence = calculateViolatedConfidence(memory.confidence);
  const newTimesViolated = memory.times_violated + 1;
  const demoteFromGolden = memory.is_golden && shouldDemoteFromGolden(newTimesViolated);

  const stmt = db.prepare(`
    UPDATE memories SET
      times_violated = ?,
      confidence = ?,
      is_golden = ?,
      updated_at = ?
    WHERE id = ?
    RETURNING *
  `);

  return stmt.get(
    newTimesViolated,
    newConfidence,
    demoteFromGolden ? 0 : (memory.is_golden ? 1 : 0),
    Date.now(),
    id
  ) as Memory;
}

export function supersedeMemory(
  oldId: number,
  newContent: string,
  evolutionNote?: string
): { old: Memory; new: Memory } | null {
  const db = getDb();
  const oldMemory = getMemory(oldId);

  if (!oldMemory) return null;
  if (oldMemory.status !== "current") return null;

  const newMemory = addMemory({
    concept_type: oldMemory.concept_type,
    content: newContent,
    domain: oldMemory.domain ?? undefined,
    project_id: oldMemory.project_id ?? undefined,
    source: "supersede",
  });

  const now = Date.now();
  const updateStmt = db.prepare(`
    UPDATE memories SET
      status = 'superseded',
      superseded_by = ?,
      superseded_at = ?,
      evolution_note = ?,
      updated_at = ?
    WHERE id = ?
  `);
  updateStmt.run(newMemory.id, now, evolutionNote ?? null, now, oldId);

  const setEvolvedStmt = db.prepare(`
    UPDATE memories SET evolved_from = ? WHERE id = ?
  `);
  setEvolvedStmt.run(oldId, newMemory.id);

  return {
    old: getMemory(oldId)!,
    new: getMemory(newMemory.id)!,
  };
}

export function getMemoryChain(memoryId: number): Memory[] {
  const start = getMemory(memoryId);
  if (!start) return [];

  let root = start;
  while (root.evolved_from) {
    const parent = getMemory(root.evolved_from);
    if (!parent) break;
    root = parent;
  }

  const chain: Memory[] = [root];
  let current = root;
  while (current.superseded_by) {
    const next = getMemory(current.superseded_by);
    if (!next) break;
    chain.push(next);
    current = next;
  }

  return chain;
}
