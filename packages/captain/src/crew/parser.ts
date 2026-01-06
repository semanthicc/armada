import { parseBaseFrontmatter } from '../core/parser';
import type { ParsedCrewFrontmatter, CrewMode } from './types';

function parseToolsField(raw: unknown): string[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  return undefined;
}

function parseSpawnWithField(raw: unknown): string[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  return undefined;
}

function parseMode(raw: unknown): CrewMode | undefined {
  if (raw === 'agent' || raw === 'subagent') return raw;
  return undefined;
}

function parseTemperature(raw: unknown): number | undefined {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) return parsed;
  }
  return undefined;
}

export function parseCrewFrontmatter(fileContent: string): ParsedCrewFrontmatter {
  const base = parseBaseFrontmatter(fileContent);
  
  const rawFrontmatter = extractRawFrontmatter(fileContent);
  
  return {
    aliases: base.aliases,
    tags: base.tags,
    onlyFor: base.onlyFor,
    description: base.description,
    body: base.body,
    model: typeof rawFrontmatter.model === 'string' ? rawFrontmatter.model : undefined,
    temperature: parseTemperature(rawFrontmatter.temperature),
    tools: parseToolsField(rawFrontmatter.tools),
    mode: parseMode(rawFrontmatter.mode),
    spawnWith: parseSpawnWithField(rawFrontmatter.spawnWith),
    toolPolicy: rawFrontmatter.toolPolicy === null ? null : (typeof rawFrontmatter.toolPolicy === 'string' ? rawFrontmatter.toolPolicy : undefined),
  };
}

function extractRawFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  
  const yaml = match[1];
  const result: Record<string, unknown> = {};
  
  for (const line of yaml.split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    
    if (value.startsWith('[') && value.endsWith(']')) {
      result[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    } else if (value.startsWith('"') && value.endsWith('"')) {
      result[key] = value.slice(1, -1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      result[key] = value.slice(1, -1);
    } else if (!isNaN(Number(value)) && value !== '') {
      result[key] = Number(value);
    } else if (value === 'null' || value === '~') {
      result[key] = null;
    } else {
      result[key] = value;
    }
  }
  
  return result;
}
