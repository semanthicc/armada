import { getDb } from "../db";
import type { SemanthiccContext } from "../context";
import type { Memory, CreateMemoryInput, MemoryWithEffectiveConfidence } from "../types";
import {
  HEURISTICS,
  getEffectiveConfidence,
  calculateValidatedConfidence,
  calculateViolatedConfidence,
  shouldPromoteToGolden,
  shouldDemoteFromGolden,
} from "./confidence";

function getLegacyContext(): SemanthiccContext {
  return { db: getDb() };
}

export function addMemory(ctxOrInput: SemanthiccContext | CreateMemoryInput, input?: CreateMemoryInput): Memory {
  const ctx = input ? (ctxOrInput as SemanthiccContext) : getLegacyContext();
  const data = input ?? (ctxOrInput as CreateMemoryInput);
  
  const stmt = ctx.db.prepare(`
    INSERT INTO memories (concept_type, content, domain, project_id, source, source_session_id, source_tool, keywords)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `);

  return stmt.get(
    data.concept_type,
    data.content,
    data.domain ?? null,
    data.project_id ?? null,
    data.source ?? "explicit",
    data.source_session_id ?? null,
    data.source_tool ?? null,
    data.keywords ?? null
  ) as Memory;
}

export function getMemory(ctxOrId: SemanthiccContext | number, id?: number): Memory | null {
  const ctx = typeof id === "number" ? (ctxOrId as SemanthiccContext) : getLegacyContext();
  const memoryId = id ?? (ctxOrId as number);
  
  const stmt = ctx.db.prepare("SELECT * FROM memories WHERE id = ?");
  return stmt.get(memoryId) as Memory | null;
}

export function deleteMemory(ctxOrId: SemanthiccContext | number, id?: number): boolean {
  const ctx = typeof id === "number" ? (ctxOrId as SemanthiccContext) : getLegacyContext();
  const memoryId = id ?? (ctxOrId as number);
  
  const stmt = ctx.db.prepare("DELETE FROM memories WHERE id = ?");
  const result = stmt.run(memoryId);
  return result.changes > 0;
}

export interface ListMemoriesOptions {
  projectId?: number | null;
  domain?: string;
  conceptTypes?: string[];
  includeGlobal?: boolean;
  includeHistory?: boolean;
  limit?: number;
}

export function listMemories(
  ctxOrOptions: SemanthiccContext | ListMemoriesOptions,
  options?: ListMemoriesOptions
): MemoryWithEffectiveConfidence[] {
  const ctx = options ? (ctxOrOptions as SemanthiccContext) : getLegacyContext();
  const opts = options ?? (ctxOrOptions as ListMemoriesOptions);
  
  const {
    projectId = null,
    domain,
    conceptTypes = ["pattern", "rule", "constraint"],
    includeGlobal = true,
    includeHistory = false,
    limit = HEURISTICS.MAX_INJECTION_COUNT,
  } = opts;

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

  const stmt = ctx.db.prepare(sql);
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

export function validateMemory(ctxOrId: SemanthiccContext | number, id?: number): Memory | null {
  const ctx = typeof id === "number" ? (ctxOrId as SemanthiccContext) : getLegacyContext();
  const memoryId = id ?? (ctxOrId as number);
  
  const memory = getMemory(ctx, memoryId);
  if (!memory) return null;

  const newConfidence = calculateValidatedConfidence(memory.confidence);
  const newTimesValidated = memory.times_validated + 1;
  const promoteToGolden = shouldPromoteToGolden(
    newConfidence,
    newTimesValidated,
    memory.times_violated
  );

  const stmt = ctx.db.prepare(`
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
    memoryId
  ) as Memory;
}

export function violateMemory(ctxOrId: SemanthiccContext | number, id?: number): Memory | null {
  const ctx = typeof id === "number" ? (ctxOrId as SemanthiccContext) : getLegacyContext();
  const memoryId = id ?? (ctxOrId as number);
  
  const memory = getMemory(ctx, memoryId);
  if (!memory) return null;

  const newConfidence = calculateViolatedConfidence(memory.confidence);
  const newTimesViolated = memory.times_violated + 1;
  const demoteFromGolden = memory.is_golden && shouldDemoteFromGolden(newTimesViolated);

  const stmt = ctx.db.prepare(`
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
    memoryId
  ) as Memory;
}

export interface SupersedeResult {
  old: Memory;
  new: Memory;
}

export function supersedeMemory(
  ctxOrOldId: SemanthiccContext | number,
  oldIdOrNewContent: number | string,
  newContentOrNote?: string,
  evolutionNote?: string
): SupersedeResult | null {
  let ctx: SemanthiccContext;
  let oldId: number;
  let newContent: string;
  let note: string | undefined;
  
  if (typeof ctxOrOldId === "number") {
    ctx = getLegacyContext();
    oldId = ctxOrOldId;
    newContent = oldIdOrNewContent as string;
    note = newContentOrNote;
  } else {
    ctx = ctxOrOldId;
    oldId = oldIdOrNewContent as number;
    newContent = newContentOrNote!;
    note = evolutionNote;
  }
  
  const oldMemory = getMemory(ctx, oldId);

  if (!oldMemory) return null;
  if (oldMemory.status !== "current") return null;

  const newMemory = addMemory(ctx, {
    concept_type: oldMemory.concept_type,
    content: newContent,
    domain: oldMemory.domain ?? undefined,
    project_id: oldMemory.project_id ?? undefined,
    source: "supersede",
  });

  const now = Date.now();
  const updateStmt = ctx.db.prepare(`
    UPDATE memories SET
      status = 'superseded',
      superseded_by = ?,
      superseded_at = ?,
      evolution_note = ?,
      updated_at = ?
    WHERE id = ?
  `);
  updateStmt.run(newMemory.id, now, note ?? null, now, oldId);

  const setEvolvedStmt = ctx.db.prepare(`
    UPDATE memories SET evolved_from = ? WHERE id = ?
  `);
  setEvolvedStmt.run(oldId, newMemory.id);

  return {
    old: getMemory(ctx, oldId)!,
    new: getMemory(ctx, newMemory.id)!,
  };
}

export function archiveMemory(ctxOrId: SemanthiccContext | number, id?: number): boolean {
  const ctx = typeof id === "number" ? (ctxOrId as SemanthiccContext) : getLegacyContext();
  const memoryId = id ?? (ctxOrId as number);
  
  const stmt = ctx.db.prepare("UPDATE memories SET status = 'archived', updated_at = ? WHERE id = ?");
  const result = stmt.run(Date.now(), memoryId);
  return result.changes > 0;
}

export function getMemoryChain(ctxOrId: SemanthiccContext | number, memoryId?: number): Memory[] {
  const ctx = typeof memoryId === "number" ? (ctxOrId as SemanthiccContext) : getLegacyContext();
  const id = memoryId ?? (ctxOrId as number);
  
  const start = getMemory(ctx, id);
  if (!start) return [];

  let root = start;
  while (root.evolved_from) {
    const parent = getMemory(ctx, root.evolved_from);
    if (!parent) break;
    root = parent;
  }

  const chain: Memory[] = [root];
  let current = root;
  while (current.superseded_by) {
    const next = getMemory(ctx, current.superseded_by);
    if (!next) break;
    chain.push(next);
    current = next;
  }

  return chain;
}
