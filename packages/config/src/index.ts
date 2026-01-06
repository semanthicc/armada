import { homedir } from 'os';
import { join } from 'path';
import type { 
  SemanthiccConfig, 
  LegacySemanthiccConfig, 
  LegacyCaptainConfig,
  CompassConfig,
  CaptainConfig
} from '@semanthicc/types';

function expandHome(filepath: string): string {
  if (filepath.startsWith('~')) {
    return join(homedir(), filepath.slice(1));
  }
  return filepath;
}

function readJsonSafe<T>(filepath: string): T | null {
  try {
    const expanded = expandHome(filepath);
    const file = Bun.file(expanded);
    if (!file.size) return null;
    const content = file.toString();
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function readJsonSafeAsync<T>(filepath: string): Promise<T | null> {
  try {
    const expanded = expandHome(filepath);
    const file = Bun.file(expanded);
    if (!(await file.exists())) return null;
    return await file.json() as T;
  } catch {
    return null;
  }
}

async function writeJsonSafe(filepath: string, data: unknown): Promise<boolean> {
  try {
    const expanded = expandHome(filepath);
    await Bun.write(expanded, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}

export async function loadConfig(projectPath?: string): Promise<SemanthiccConfig> {
  if (projectPath) {
    const projectConfig = await readJsonSafeAsync<SemanthiccConfig>(
      join(projectPath, '.semanthicc', 'config.json')
    );
    if (projectConfig) return projectConfig;
  }

  const globalConfig = await readJsonSafeAsync<SemanthiccConfig>(
    '~/.config/semanthicc/config.json'
  );
  if (globalConfig) return globalConfig;

  const altGlobalConfig = await readJsonSafeAsync<SemanthiccConfig>(
    '~/.config/opencode/semanthicc.json'
  );
  if (altGlobalConfig && altGlobalConfig.compass) {
    return altGlobalConfig;
  }

  const legacyConfig = await loadLegacyConfig();
  if (legacyConfig) {
    await migrateConfig(legacyConfig);
    return legacyConfig;
  }

  return {};
}

async function loadLegacyConfig(): Promise<SemanthiccConfig | null> {
  const legacySemanthicc = await readJsonSafeAsync<LegacySemanthiccConfig>(
    '~/.config/opencode/semanthicc.json'
  );
  const legacyCaptain = await readJsonSafeAsync<LegacyCaptainConfig>(
    '~/.config/opencode/captain.json'
  );

  if (!legacySemanthicc && !legacyCaptain) return null;

  const config: SemanthiccConfig = {};

  if (legacySemanthicc) {
    config.compass = {
      enabled: true,
      embedding: legacySemanthicc.embedding,
    };
    config.dashboard = legacySemanthicc.dashboard === 'manual' ? false : legacySemanthicc.dashboard;
  }

  if (legacyCaptain) {
    config.captain = {
      enabled: true,
      expandOrders: legacyCaptain.expandOrders,
      toolProfiles: legacyCaptain.toolProfiles,
      defaultToolPolicy: legacyCaptain.defaultToolPolicy,
    };
  }

  return config;
}

async function migrateConfig(config: SemanthiccConfig): Promise<void> {
  await writeJsonSafe('~/.config/semanthicc/config.json', config);
}

export async function getCompassConfig(projectPath?: string): Promise<CompassConfig> {
  const config = await loadConfig(projectPath);
  return config.compass ?? { enabled: true };
}

export async function getCaptainConfig(projectPath?: string): Promise<CaptainConfig> {
  const config = await loadConfig(projectPath);
  return config.captain ?? { enabled: true };
}

export async function getDashboardConfig(projectPath?: string): Promise<{ enabled: boolean; port: number }> {
  const config = await loadConfig(projectPath);
  
  if (config.dashboard === false) {
    return { enabled: false, port: 5174 };
  }
  
  if (config.dashboard === 'auto' || config.dashboard === undefined) {
    return { enabled: true, port: 5174 };
  }
  
  return {
    enabled: config.dashboard.enabled !== false,
    port: config.dashboard.port ?? 5174,
  };
}

export async function isPluginEnabled(pluginId: 'compass' | 'captain', projectPath?: string): Promise<boolean> {
  const config = await loadConfig(projectPath);
  
  if (pluginId === 'compass') {
    return config.compass?.enabled !== false;
  }
  
  if (pluginId === 'captain') {
    return config.captain?.enabled !== false;
  }
  
  return false;
}

export type { SemanthiccConfig, CompassConfig, CaptainConfig } from '@semanthicc/types';
