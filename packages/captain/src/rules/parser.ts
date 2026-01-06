import { parseBaseFrontmatter } from '../core/parser';
import type { ParsedRuleFrontmatter } from './types';

export function parseRuleFrontmatter(fileContent: string): ParsedRuleFrontmatter {
  const base = parseBaseFrontmatter(fileContent);
  return {
    aliases: base.aliases,
    tags: base.tags,
    onlyFor: base.onlyFor,
    description: base.description,
    body: base.body,
  };
}
