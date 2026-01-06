/**
 * Semanthicc Context - Dependency Injection Container
 * 
 * All database-dependent operations receive this context as first parameter.
 * This enables:
 * - Test isolation (each test gets fresh in-memory DB)
 * - No global state pollution
 * - Explicit dependencies
 */

import type { Database } from "bun:sqlite";

export interface SemanthiccContext {
  db: Database;
}

/**
 * Create a context from an existing database connection.
 * Use createProductionContext() or createTestContext() for common cases.
 */
export function createContext(db: Database): SemanthiccContext {
  return { db };
}
