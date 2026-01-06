import type { BasePrompt, TagEntry } from '../core/types';

export type AutomentionMode = 'true' | 'expanded' | 'false';
export type ScrollInScrollMode = 'true' | 'hints' | 'false';
export type OrderInOrderMode = ScrollInScrollMode;

export interface SpawnForEntry {
  agent: string;
  mode: 'hint' | 'expanded';
}
export type SpawnAtEntry = SpawnForEntry;

export interface Scroll extends BasePrompt {
  promptType: 'scroll';
  automention: AutomentionMode;
  scrollInScroll: ScrollInScrollMode;
  spawnFor: SpawnForEntry[];
  expand: boolean;
  include: string[];
  includeWarnings: string[];
  onLoad: string[];
}
export type Order = Scroll;

export interface ScrollRef {
  id: string;
  messageID: string;
  implicit?: boolean;
}
export type OrderRef = ScrollRef;

export interface ScrollMention {
  name: string;
  args: Record<string, string>;
  force: boolean;
}
export type OrderMention = ScrollMention;

export interface ExpansionResult {
  text: string;
  found: string[];
  reused: string[];
  notFound: string[];
  suggestions: Map<string, string[]>;
  hints: string[];
  warnings: string[];
  newRefs: Map<string, ScrollRef>;
}

export interface ParsedScrollFrontmatter {
  aliases: string[];
  tags: TagEntry[];
  onlyFor: string[];
  spawnFor: SpawnForEntry[];
  description: string;
  automention: AutomentionMode;
  scrollInScroll: ScrollInScrollMode;
  orderInOrder: ScrollInScrollMode;
  spawnAt: SpawnForEntry[];
  expand: boolean;
  include: string[];
  onLoad: string[];
  body: string;
}
export type ParsedOrderFrontmatter = ParsedScrollFrontmatter;
