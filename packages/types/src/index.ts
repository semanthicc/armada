export interface PluginManifest {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  routes: {
    path: string;
    label: string;
    component: () => Promise<{ default: unknown }>;
  }[];
}

export interface CompassEmbeddingConfig {
  provider: 'local' | 'gemini' | 'openai';
  geminiModel?: string;
  geminiApiKey?: string;
  openaiModel?: string;
  openaiApiKey?: string;
  dimensions?: number | null;
}

export interface CompassConfig {
  enabled?: boolean;
  indexPath?: string;
  embedding?: CompassEmbeddingConfig;
  elf?: {
    rulesEnabled?: boolean;
    heuristicsEnabled?: boolean;
  };
}

export interface ToolProfile {
  mode: 'blocklist' | 'allowlist';
  disabled?: string[];
  enabled?: string[];
}

export interface CaptainConfig {
  enabled?: boolean;
  expandOrders?: boolean;
  workflowsPath?: string;
  toolProfiles?: Record<string, ToolProfile>;
  defaultToolPolicy?: string;
}

export interface DashboardConfig {
  enabled?: boolean | 'auto';
  port?: number;
}

export interface SemanthiccConfig {
  $schema?: string;
  compass?: CompassConfig;
  captain?: CaptainConfig;
  dashboard?: DashboardConfig | 'auto' | false;
}

export interface LegacySemanthiccConfig {
  dashboard?: 'auto' | 'manual' | false;
  embedding?: CompassEmbeddingConfig;
}

export interface LegacyCaptainConfig {
  expandOrders?: boolean;
  toolProfiles?: Record<string, ToolProfile>;
  defaultToolPolicy?: string;
}

export const CONFIG_PATHS = {
  unified: {
    project: './.semanthicc/config.json',
    global: '~/.config/semanthicc/config.json',
    altGlobal: '~/.config/opencode/semanthicc.json',
  },
  legacy: {
    semanthicc: '~/.config/opencode/semanthicc.json',
    captain: '~/.config/opencode/captain.json',
  },
} as const;
