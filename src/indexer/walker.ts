import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { isCodeFile, shouldExclude } from "./exclusions";

export interface WalkedFile {
  absolutePath: string;
  relativePath: string;
  size: number;
}

function parseGitignore(projectPath: string): string[] {
  const gitignorePath = join(projectPath, ".gitignore");
  if (!existsSync(gitignorePath)) return [];
  
  const content = readFileSync(gitignorePath, "utf-8");
  return content
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"));
}

function matchesGitignore(relativePath: string, patterns: string[]): boolean {
  const normalizedPath = relativePath.replace(/\\/g, "/");
  
  for (const pattern of patterns) {
    const cleanPattern = pattern.replace(/^\//, "").replace(/\/$/, "");
    
    if (normalizedPath === cleanPattern) return true;
    if (normalizedPath.startsWith(cleanPattern + "/")) return true;
    if (normalizedPath.includes("/" + cleanPattern + "/")) return true;
    if (normalizedPath.includes("/" + cleanPattern)) return true;
  }
  
  return false;
}

export function walkProject(
  projectPath: string,
  options: { maxFiles?: number } = {}
): WalkedFile[] {
  const { maxFiles = 1000 } = options;
  const files: WalkedFile[] = [];
  const gitignorePatterns = parseGitignore(projectPath);
  
  function walk(dir: string): void {
    if (files.length >= maxFiles) return;
    
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    
    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      
      const absolutePath = join(dir, entry);
      const relativePath = relative(projectPath, absolutePath);
      
      if (shouldExclude(relativePath)) continue;
      if (matchesGitignore(relativePath, gitignorePatterns)) continue;
      
      let stat;
      try {
        stat = statSync(absolutePath);
      } catch {
        continue;
      }
      
      if (stat.isDirectory()) {
        walk(absolutePath);
      } else if (stat.isFile() && isCodeFile(relativePath)) {
        files.push({
          absolutePath,
          relativePath,
          size: stat.size,
        });
      }
    }
  }
  
  walk(projectPath);
  return files;
}
