import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Theme, CaptainConfig } from './types';

const DEFAULT_CONFIG: CaptainConfig = {
  deduplicateSameMessage: true,
  maxNestingDepth: 3,
  expandOrders: true,
};

export function loadConfig(): CaptainConfig {
  const configDir = join(homedir(), '.config', 'opencode');
  const configPath = join(configDir, 'captain.json');
  const legacyPath = join(configDir, 'workflows.json');
  
  try {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    let content: string | null = null;
    
    if (existsSync(configPath)) {
      content = readFileSync(configPath, 'utf-8');
    } else if (existsSync(legacyPath)) {
      content = readFileSync(legacyPath, 'utf-8');
    }

    if (!content) {
      writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
      return DEFAULT_CONFIG;
    }

    const json = JSON.parse(content);
    const config: CaptainConfig = {
      deduplicateSameMessage: json.deduplicateSameMessage ?? true,
      maxNestingDepth: json.maxNestingDepth ?? 3,
      expandOrders: json.expandOrders ?? true,
      theme: json.theme,
      toolProfiles: json.toolProfiles,
      defaultToolPolicy: json.defaultToolPolicy,
    };
    
    // Validate: warn if defaultToolPolicy references non-existent profile
    if (config.defaultToolPolicy && config.toolProfiles) {
      if (!config.toolProfiles[config.defaultToolPolicy]) {
        console.warn(`[captain] Warning: defaultToolPolicy "${config.defaultToolPolicy}" not found in toolProfiles`);
      }
    } else if (config.defaultToolPolicy && !config.toolProfiles) {
      console.warn(`[captain] Warning: defaultToolPolicy "${config.defaultToolPolicy}" set but no toolProfiles defined`);
    }
    
    return config;
  } catch (err) {
    console.error(`[captain] Failed to load config: ${err instanceof Error ? err.message : err}`);
  }
  return DEFAULT_CONFIG;
}

export function detectTheme(projectDir: string): Theme {
  const pirateIndicators = [
    join(projectDir, '.opencode', 'orders'),
    join(homedir(), '.config', 'opencode', 'orders'),
  ];
  
  const hasPirate = pirateIndicators.some(p => existsSync(p));
  return hasPirate ? 'pirate' : 'standard';
}

const MESSAGES: Record<Theme, Record<string, string>> = {
  pirate: {
    ordersMatched: '⚡ Orders matched',
    orderExpanded: '✓ Orders executed',
    didYouMean: 'Did ye mean, matey?',
    notFound: "Order not found in the Captain's log",
    autoApply: 'Auto-apply orders',
    suggested: 'Suggested orders',
  },
  standard: {
    ordersMatched: 'Important. Workflow Detected',
    orderExpanded: '✓ Expanded',
    didYouMean: 'Did you mean?',
    notFound: 'Workflow not found',
    autoApply: 'Auto-apply workflows',
    suggested: 'Suggested workflows',
  },
};

export function getMessage(key: string, theme: Theme): string {
  return MESSAGES[theme][key] || MESSAGES.standard[key] || key;
}
