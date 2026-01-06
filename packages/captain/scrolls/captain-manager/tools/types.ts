export type ItemType = 'workflow' | 'rule' | 'crew';

export interface ItemFilter {
  type?: ItemType;
  tag?: string;
  folder?: string;
}

export interface CaptainItem {
  type: ItemType;
  name: string;
  description?: string;
  source: 'project' | 'global' | 'bundled';
  tags?: string[];
  path?: string;
}

export interface CreateItemParams {
  type: ItemType;
  name: string;
  content: string;
  tags?: string[];
}

export interface UpdateItemParams {
  type: ItemType;
  name: string;
  content?: string;
  tags?: string[];
  rename?: string;
}
