import { compassManifest } from './compass/manifest';
import type { PluginManifest } from './compass/manifest';

export type { PluginManifest };

export const allPlugins: PluginManifest[] = [
  compassManifest,
];

export function getEnabledPlugins(enabledIds?: string[]): PluginManifest[] {
  if (!enabledIds) {
    return allPlugins;
  }
  return allPlugins.filter(p => enabledIds.includes(p.id));
}

export function getPluginById(id: string): PluginManifest | undefined {
  return allPlugins.find(p => p.id === id);
}
