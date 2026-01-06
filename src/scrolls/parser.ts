import { parseBaseFrontmatter, parseArrayField, extractYaml } from '../core/parser';
import type { SpawnForEntry, AutomentionMode, ScrollInScrollMode, ParsedScrollFrontmatter } from './types';

export function parseSpawnForField(yaml: string): SpawnForEntry[] {
  const raw = parseArrayField(yaml, 'spawnFor') || parseArrayField(yaml, 'spawnAt');
  return raw.map(entry => {
    if (entry.includes(':')) {
      const [agent, mode] = entry.split(':');
      return { agent: agent.trim(), mode: mode.trim() === 'expanded' ? 'expanded' : 'hint' } as SpawnForEntry;
    }
    return { agent: entry.trim(), mode: 'hint' } as SpawnForEntry;
  });
}

export function parseScrollFrontmatter(fileContent: string): ParsedScrollFrontmatter {
  const base = parseBaseFrontmatter(fileContent);
  const extracted = extractYaml(fileContent);
  
  if (!extracted) {
    return {
      ...base,
      spawnFor: [],
      spawnAt: [],
      automention: 'true',
      scrollInScroll: 'false',
      orderInOrder: 'false',
      expand: true,
      include: [],
      onLoad: [],
    };
  }

  const { yaml } = extracted;
  const spawnFor = parseSpawnForField(yaml);
  
  const autoMatch = yaml.match(/^automention:\s*(.*)$/m);
  const legacyAutoMatch = yaml.match(/^autoworkflow:\s*(.*)$/m);
  let automention: AutomentionMode = 'true';
  
  const matchToUse = autoMatch || legacyAutoMatch;
  if (matchToUse) {
    const val = matchToUse[1].trim().toLowerCase();
    if (val === 'false' || val === 'no') {
      automention = 'false';
    } else if (val === 'expanded') {
      automention = 'expanded';
    } else if (val === 'true' || val === 'yes' || val === 'hintforuser' || val === 'hint') {
      automention = 'true';
    }
  }

  const wiwMatch = yaml.match(/^workflowInWorkflow:\s*(.*)$/m);
  const oioMatch = yaml.match(/^orderInOrder:\s*(.*)$/m);
  const sisMatch = yaml.match(/^scrollInScroll:\s*(.*)$/m);
  let scrollInScroll: ScrollInScrollMode = 'false';
  
  const sisMatchToUse = sisMatch || oioMatch || wiwMatch;
  if (sisMatchToUse) {
    const val = sisMatchToUse[1].trim().toLowerCase();
    if (val === 'true' || val === 'yes') {
      scrollInScroll = 'true';
    } else if (val === 'hints' || val === 'hint') {
      scrollInScroll = 'hints';
    }
  }

  const expandMatch = yaml.match(/^expand:\s*(.*)$/m);
  let expand = true;
  if (expandMatch) {
    const val = expandMatch[1].trim().toLowerCase();
    expand = val !== 'false' && val !== 'no';
  }

  const include = parseArrayField(yaml, 'include');
  const onLoadSnake = parseArrayField(yaml, 'on_load');
  const onLoad = onLoadSnake.length > 0 ? onLoadSnake : parseArrayField(yaml, 'onLoad');

  return {
    ...base,
    spawnFor,
    spawnAt: spawnFor,
    automention,
    scrollInScroll,
    orderInOrder: scrollInScroll,
    expand,
    include,
    onLoad,
  };
}

export const parseSpawnAtField = parseSpawnForField;
export const parseOrderFrontmatter = parseScrollFrontmatter;
