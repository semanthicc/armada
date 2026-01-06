import type { Component } from 'svelte';

export interface PluginManifest {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  routes: {
    path: string;
    label: string;
    component: () => Promise<{ default: Component }>;
  }[];
}

export interface SemConfig {
  compass?: {
    indexPath?: string;
    embedModel?: string;
    elf?: {
      rulesEnabled?: boolean;
      heuristicsEnabled?: boolean;
    };
  };
  captain?: {
    workflowsPath?: string;
  };
  dashboard?: 'auto' | 'manual' | false;
}
