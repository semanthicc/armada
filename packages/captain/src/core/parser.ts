import type { TagEntry, TagOrGroup, BaseParsedFrontmatter } from './types';

export function parseArrayField(yaml: string, fieldName: string): string[] {
  const multiLineRegex = new RegExp(`^${fieldName}:\\s*\\r?\\n((?:\\s+-[^\\n]*\\n?)*)`, 'm');
  const multiMatch = yaml.match(multiLineRegex);
  if (multiMatch && multiMatch[1]) {
    const lines = multiMatch[1].split(/\r?\n/);
    const items: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')) {
        items.push(trimmed.slice(2).trim().replace(/['"]/g, ''));
      }
    }
    if (items.length > 0) {
      return items.filter(a => a);
    }
  }

  const inlineRegex = new RegExp(`^${fieldName}:\\s*(?:\\[(.*)\\]|(.+))$`, 'm');
  const match = yaml.match(inlineRegex);
  if (!match) return [];
  
  const raw = match[1] || match[2];
  if (!raw || !raw.trim()) return [];
  
  return raw.split(',').map(a => a.trim().replace(/['"]/g, '')).filter(a => a);
}

export function parseTagsField(yaml: string): TagEntry[] {
  const regex = /^tags:\s*\[([\s\S]*?)\]\s*$/m;
  const match = yaml.match(regex);
  if (!match) return [];
  
  const content = match[1].trim();
  if (!content) return [];
  
  const result: TagEntry[] = [];
  let depth = 0;
  let current = '';
  let inGroup = false;
  let groupItems: (string | TagOrGroup)[] = [];
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    
    if (char === '[') {
      depth++;
      if (depth === 1) {
        inGroup = true;
        groupItems = [];
        continue;
      }
    } else if (char === ']') {
      depth--;
      if (depth === 0 && inGroup) {
        if (current.trim()) {
          const trimmed = current.trim().replace(/['"]/g, '');
          if (trimmed.includes('|')) {
            groupItems.push({ or: trimmed.split('|').map(s => s.trim()).filter(s => s) });
          } else {
            groupItems.push(trimmed);
          }
        }
        if (groupItems.length > 0) {
          result.push(groupItems);
        }
        current = '';
        inGroup = false;
        continue;
      }
    } else if (char === ',' && depth === 0) {
      const trimmed = current.trim().replace(/['"]/g, '');
      if (trimmed) {
        if (trimmed.includes('|')) {
          result.push({ or: trimmed.split('|').map(s => s.trim()).filter(s => s) });
        } else {
          result.push(trimmed);
        }
      }
      current = '';
      continue;
    } else if (char === ',' && depth === 1 && inGroup) {
      const trimmed = current.trim().replace(/['"]/g, '');
      if (trimmed) {
        if (trimmed.includes('|')) {
          groupItems.push({ or: trimmed.split('|').map(s => s.trim()).filter(s => s) });
        } else {
          groupItems.push(trimmed);
        }
      }
      current = '';
      continue;
    }
    
    current += char;
  }
  
  const trimmed = current.trim().replace(/['"]/g, '');
  if (trimmed && !inGroup) {
    if (trimmed.includes('|')) {
      result.push({ or: trimmed.split('|').map(s => s.trim()).filter(s => s) });
    } else {
      result.push(trimmed);
    }
  }
  
  return result;
}

export function parseStringField(yaml: string, fieldName: string): string {
  const regex = new RegExp(`^${fieldName}:\\s*(.*)$`, 'm');
  const match = yaml.match(regex);
  if (!match) return '';
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

export function parseBaseFrontmatter(fileContent: string): BaseParsedFrontmatter {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
  const match = fileContent.match(frontmatterRegex);

  if (!match) {
    return { aliases: [], tags: [], onlyFor: [], description: '', body: fileContent };
  }

  const yaml = match[1];
  const body = fileContent.slice(match[0].length);

  const aliases = [
    ...parseArrayField(yaml, 'aliases'),
    ...parseArrayField(yaml, 'shortcuts')
  ];
  
  const tags = parseTagsField(yaml);
  
  const onlyFor = [
    ...parseArrayField(yaml, 'onlyFor'),
    ...parseArrayField(yaml, 'agents')
  ];

  const description = parseStringField(yaml, 'description');

  return { aliases, tags, onlyFor, description, body };
}

export function extractYaml(fileContent: string): { yaml: string; body: string } | null {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
  const match = fileContent.match(frontmatterRegex);
  
  if (!match) return null;
  
  return {
    yaml: match[1],
    body: fileContent.slice(match[0].length)
  };
}
