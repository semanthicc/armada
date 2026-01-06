import type { BasePrompt, TagEntry } from '../core/types';

export type CrewMode = 'agent' | 'subagent';

export interface Crew extends BasePrompt {
  promptType: 'crew';
  model?: string;
  temperature?: number;
  tools?: string[];
  mode: CrewMode;
  spawnWith?: string[];
  toolPolicy?: string | null;
}

export interface ParsedCrewFrontmatter {
  aliases: string[];
  tags: TagEntry[];
  onlyFor: string[];
  description: string;
  body: string;
  model?: string;
  temperature?: number;
  tools?: string[];
  mode?: CrewMode;
  spawnWith?: string[];
  toolPolicy?: string | null;
}
