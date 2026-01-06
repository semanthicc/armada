// Common coding synonyms to improve FTS recall
export const SYNONYMS: Record<string, string[]> = {
  // Auth
  "auth": ["authentication", "login", "sign in", "verify", "credential", "token", "jwt"],
  "login": ["auth", "authentication", "sign in", "log in", "signin"],
  "signup": ["register", "create account", "sign up"],
  "logout": ["sign out", "log out"],
  
  // CRUD / Data
  "save": ["persist", "store", "write", "update", "insert", "create"],
  "load": ["fetch", "get", "read", "retrieve", "query", "select"],
  "delete": ["remove", "destroy", "erase", "purge", "drop"],
  "update": ["modify", "change", "edit", "patch", "save"],
  "find": ["search", "query", "lookup", "get", "locate"],
  
  // Infrastructure
  "db": ["database", "sql", "store", "storage", "repo", "repository"],
  "api": ["endpoint", "route", "handler", "controller", "service", "rest", "graphql"],
  "config": ["configuration", "settings", "env", "environment", "setup", "options"],
  "server": ["backend", "app", "service", "daemon", "host"],
  "client": ["frontend", "ui", "browser", "app", "web"],
  
  // Coding concepts
  "error": ["exception", "fail", "failure", "crash", "bug", "issue"],
  "test": ["spec", "suite", "unit", "integration", "e2e", "verify", "check"],
  "util": ["helper", "common", "shared", "lib", "library", "utils"],
  "type": ["interface", "class", "struct", "model", "schema", "definition"],
  "parse": ["decode", "read", "convert", "transform", "serialize"],
  "init": ["start", "setup", "bootstrap", "create", "construct", "initialize"],
};

export function expandQuery(query: string): string {
  const terms = query.toLowerCase().split(/\s+/);
  const expanded = new Set<string>(terms);
  
  for (const term of terms) {
    // Check exact match
    if (SYNONYMS[term]) {
      SYNONYMS[term].forEach(s => expanded.add(s));
    }
    
    // Check stemming/partial (simple)
    // e.g. "saving" -> "save"
    if (term.endsWith("ing")) {
      const base = term.slice(0, -3);
      if (SYNONYMS[base]) SYNONYMS[base].forEach(s => expanded.add(s));
      // Also add "e" back? "saving" -> "save" works, "writing" -> "writ" (fail)
      const baseE = base + "e";
      if (SYNONYMS[baseE]) SYNONYMS[baseE].forEach(s => expanded.add(s));
    }
  }
  
  return Array.from(expanded).join(" ");
}
