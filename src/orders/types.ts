import type { BasePrompt, TagEntry } from '../core/types';

export type AutomentionMode = 'true' | 'expanded' | 'false';
export type OrderInOrderMode = 'true' | 'hints' | 'false';

export interface SpawnAtEntry {
  agent: string;
  mode: 'hint' | 'expanded';
}

export interface Order extends BasePrompt {
  automention: AutomentionMode;
  orderInOrder: OrderInOrderMode;
  spawnAt: SpawnAtEntry[];
}

export interface OrderRef {
  id: string;
  messageID: string;
  implicit?: boolean;
}

export interface OrderMention {
  name: string;
  args: Record<string, string>;
  force: boolean;
}

export interface ExpansionResult {
  text: string;
  found: string[];
  reused: string[];
  notFound: string[];
  suggestions: Map<string, string[]>;
  hints: string[];
  warnings: string[];
  newRefs: Map<string, OrderRef>;
}

export interface ParsedOrderFrontmatter {
  aliases: string[];
  tags: TagEntry[];
  onlyFor: string[];
  spawnAt: SpawnAtEntry[];
  description: string;
  automention: AutomentionMode;
  orderInOrder: OrderInOrderMode;
  body: string;
}
