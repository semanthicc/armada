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

export const compassManifest: PluginManifest = {
  id: 'compass',
  name: 'Compass',
  icon: '🧭',
  description: 'Semantic memory & code search',
  routes: [
    {
      path: '/',
      label: 'Overview',
      component: () => import('./components/StatusPanel.svelte')
    },
    {
      path: '/memories',
      label: 'Memories',
      component: () => import('./components/MemoriesTab.svelte')
    },
    {
      path: '/search',
      label: 'Search',
      component: () => import('./components/SearchTab.svelte')
    },
    {
      path: '/settings',
      label: 'Settings',
      component: () => import('./components/SettingsTab.svelte')
    }
  ]
};
