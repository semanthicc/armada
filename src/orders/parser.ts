import { parseBaseFrontmatter, parseArrayField, extractYaml } from '../core/parser';
import type { SpawnAtEntry, AutomentionMode, OrderInOrderMode, ParsedOrderFrontmatter } from './types';

export function parseSpawnAtField(yaml: string): SpawnAtEntry[] {
  const raw = parseArrayField(yaml, 'spawnAt');
  return raw.map(entry => {
    if (entry.includes(':')) {
      const [agent, mode] = entry.split(':');
      return { agent: agent.trim(), mode: mode.trim() === 'expanded' ? 'expanded' : 'hint' } as SpawnAtEntry;
    }
    return { agent: entry.trim(), mode: 'hint' } as SpawnAtEntry;
  });
}

export function parseOrderFrontmatter(fileContent: string): ParsedOrderFrontmatter {
  const base = parseBaseFrontmatter(fileContent);
  const extracted = extractYaml(fileContent);
  
  if (!extracted) {
    return {
      ...base,
      spawnAt: [],
      automention: 'true',
      orderInOrder: 'false',
    };
  }

  const { yaml } = extracted;
  const spawnAt = parseSpawnAtField(yaml);
  
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
  let orderInOrder: OrderInOrderMode = 'false';
  
  const wiwMatchToUse = wiwMatch || oioMatch;
  if (wiwMatchToUse) {
    const val = wiwMatchToUse[1].trim().toLowerCase();
    if (val === 'true' || val === 'yes') {
      orderInOrder = 'true';
    } else if (val === 'hints' || val === 'hint') {
      orderInOrder = 'hints';
    }
  }

  return {
    ...base,
    spawnAt,
    automention,
    orderInOrder,
  };
}
