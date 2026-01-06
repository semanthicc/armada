import { existsSync, readFileSync } from 'fs';
import { join, dirname, isAbsolute } from 'path';
import type { Scroll } from './types';

export interface ResolvedInclude {
  path: string;
  content: string;
  found: boolean;
}

export interface IncludeResolutionResult {
  content: string;
  resolvedIncludes: ResolvedInclude[];
  warnings: string[];
}

export function resolveIncludePath(includePath: string, scrollPath: string, projectDir: string): string {
  if (isAbsolute(includePath)) {
    return includePath;
  }
  
  const normalized = includePath.replace(/\\/g, '/');
  if (normalized.startsWith('./') || normalized.startsWith('../')) {
    return join(dirname(scrollPath), includePath);
  }
  
  const projectPath = join(projectDir, includePath);
  if (existsSync(projectPath)) {
    return projectPath;
  }
  
  return join(dirname(scrollPath), includePath);
}

export function loadIncludeContent(resolvedPath: string): { content: string; found: boolean } {
  try {
    if (existsSync(resolvedPath)) {
      return { content: readFileSync(resolvedPath, 'utf-8'), found: true };
    }
  } catch {
  }
  return { content: '', found: false };
}

export function resolveScrollIncludes(
  scroll: Scroll,
  projectDir: string
): IncludeResolutionResult {
  const warnings: string[] = [];
  const resolvedIncludes: ResolvedInclude[] = [];
  
  if (!scroll.include || scroll.include.length === 0) {
    return { content: scroll.content, resolvedIncludes, warnings };
  }

  const includedContents: string[] = [];

  for (const includePath of scroll.include) {
    const resolved = resolveIncludePath(includePath, scroll.path, projectDir);
    const { content, found } = loadIncludeContent(resolved);
    
    resolvedIncludes.push({ path: resolved, content, found });
    
    if (found) {
      includedContents.push(content);
    } else {
      warnings.push(`Include not found: ${includePath} (resolved to: ${resolved})`);
    }
  }

  const mergedContent = includedContents.length > 0
    ? includedContents.join('\n\n---\n\n') + '\n\n---\n\n' + scroll.content
    : scroll.content;

  return { content: mergedContent, resolvedIncludes, warnings };
}
