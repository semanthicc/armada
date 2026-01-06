import type { BasePrompt, TagEntry } from '../core/types';

export interface Rule extends BasePrompt {
  promptType: 'rule';
}

export interface ParsedRuleFrontmatter {
  aliases: string[];
  tags: TagEntry[];
  onlyFor: string[];
  description: string;
  body: string;
}
