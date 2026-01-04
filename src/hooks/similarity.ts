import { getDb } from "../db";
import type { SemanthiccContext } from "../context";
import type { Memory } from "../types";

function getLegacyContext(): SemanthiccContext {
  return { db: getDb() };
}

export function jaccardSimilarity(setA: string[], setB: string[]): number {
  if (setA.length === 0 || setB.length === 0) return 0;

  const a = new Set(setA);
  const b = new Set(setB);

  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return intersection / union;
}

export interface FindSimilarFailuresOptions {
  keywords: string[];
  projectId: number | null;
  threshold?: number;
}

export function findSimilarFailures(
  ctxOrKeywords: SemanthiccContext | string[],
  keywordsOrProjectId?: string[] | number | null,
  projectIdOrThreshold?: number | null,
  threshold?: number
): Memory[] {
  let ctx: SemanthiccContext;
  let keywords: string[];
  let projectId: number | null;
  let similarityThreshold: number;

  if (Array.isArray(ctxOrKeywords)) {
    ctx = getLegacyContext();
    keywords = ctxOrKeywords;
    projectId = keywordsOrProjectId as number | null;
    similarityThreshold = projectIdOrThreshold ?? 0.3;
  } else {
    ctx = ctxOrKeywords;
    keywords = keywordsOrProjectId as string[];
    projectId = projectIdOrThreshold as number | null;
    similarityThreshold = threshold ?? 0.3;
  }

  if (keywords.length === 0) return [];

  let sql = "SELECT * FROM memories WHERE source = 'passive' AND concept_type = 'learning' AND keywords IS NOT NULL";
  const params: (number | string)[] = [];

  if (projectId !== null) {
    sql += " AND (project_id = ? OR project_id IS NULL)";
    params.push(projectId);
  } else {
    sql += " AND project_id IS NULL";
  }

  const stmt = ctx.db.prepare(sql);
  const candidates = stmt.all(...params) as Memory[];

  const matches: Memory[] = [];

  for (const memory of candidates) {
    if (!memory.keywords) continue;
    
    let memoryKeywords: string[] = [];
    try {
      memoryKeywords = typeof memory.keywords === 'string' 
        ? JSON.parse(memory.keywords) 
        : memory.keywords;
    } catch {
      continue;
    }

    const score = jaccardSimilarity(keywords, memoryKeywords);
    if (score >= similarityThreshold) {
      matches.push(memory);
    }
  }

  return matches.sort((a, b) => b.created_at - a.created_at).slice(0, 3);
}
