// src/hooks/keywords.ts

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "up", "down", "over", "is", "are", "was", "were",
  "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "will", "would", "can", "could", "should", "may", "might", "must",
  "error", "failed", "failure", "exception", "warning" 
]);

const DOMAIN_MAP: Record<string, string> = {
  bash: "bash",
  read: "file-read",
  write: "file-write",
  edit: "file-edit",
  grep: "search",
  glob: "search",
  ls: "filesystem",
  mkdir: "filesystem",
  rm: "filesystem",
  mv: "filesystem",
  cp: "filesystem",
  todoread: "todo",
  todowrite: "todo",
  git: "git",
};

export function extractKeywords(text: string): string[] {
  if (!text) return [];

  return text
    .toLowerCase()
    .split(/[\s\p{P}]+/u) 
    .filter((token) => {
      
      return (
        token.length > 2 &&
        /[a-z0-9]/.test(token) &&
        !STOPWORDS.has(token)
      );
    });
}

export function getDomainFromTool(toolName: string): string {
  if (!toolName) return "unknown";
  
  
  if (DOMAIN_MAP[toolName]) return DOMAIN_MAP[toolName];
  
  
  if (toolName.startsWith("git")) return "git";
  
  
  if (toolName.startsWith("lsp")) return "lsp";

  return "unknown";
}
