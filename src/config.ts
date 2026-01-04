import { join } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { log } from "./logger";

export type EmbeddingProvider = "local" | "gemini";

export interface EmbeddingConfig {
  provider?: EmbeddingProvider;
  geminiApiKey?: string;
  geminiModel?: string;
  dimensions?: number;
}

export interface SemanthiccConfig {
  dashboard?: "auto" | "manual";
  port?: number;
  logLevel?: "debug" | "info" | "warn" | "error";
  embedding?: EmbeddingConfig;
}

let cachedGlobalConfig: SemanthiccConfig | null = null;
let cachedProjectConfig: SemanthiccConfig | null = null;
let cachedProjectPath: string | null = null;

function getGlobalConfigPath(): string {
  return join(homedir(), ".config", "opencode", "semanthicc.json");
}

export function loadGlobalConfig(): SemanthiccConfig {
  if (cachedGlobalConfig) {
    return cachedGlobalConfig;
  }
  
  try {
    const configPath = getGlobalConfigPath();
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      cachedGlobalConfig = JSON.parse(content);
      log.api.debug(`Loaded global config from ${configPath}`);
      return cachedGlobalConfig!;
    }
  } catch (e) {
    log.api.warn(`Failed to load global semanthicc.json:`, e);
  }
  return {};
}

function loadProjectConfig(projectPath: string): SemanthiccConfig {
  if (cachedProjectConfig && cachedProjectPath === projectPath) {
    return cachedProjectConfig;
  }
  
  try {
    const configPath = join(projectPath, "semanthicc.json");
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      cachedProjectConfig = JSON.parse(content);
      cachedProjectPath = projectPath;
      log.api.debug(`Loaded project config from ${configPath}`);
      return cachedProjectConfig!;
    }
  } catch (e) {
    log.api.warn(`Failed to load project semanthicc.json:`, e);
  }
  return {};
}

export function loadConfig(projectPath: string): SemanthiccConfig {
  const globalConfig = loadGlobalConfig();
  const projectConfig = loadProjectConfig(projectPath);
  
  const merged: SemanthiccConfig = {
    ...globalConfig,
    ...projectConfig,
    embedding: {
      ...globalConfig.embedding,
      ...projectConfig.embedding,
    },
  };
  
  return merged;
}

export function getEmbeddingConfig(projectPath: string): EmbeddingConfig {
  const config = loadConfig(projectPath);
  return config.embedding ?? { provider: "local" };
}

export function clearConfigCache(): void {
  cachedGlobalConfig = null;
  cachedProjectConfig = null;
  cachedProjectPath = null;
}

export function saveGlobalConfig(config: SemanthiccConfig): void {
  const configPath = getGlobalConfigPath();
  const configDir = join(homedir(), ".config", "opencode");
  try {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    cachedGlobalConfig = config;
    log.api.info(`Saved global config to ${configPath}`);
  } catch (e) {
    log.api.error(`Failed to save global semanthicc.json:`, e);
    throw e;
  }
}

export function saveProjectConfig(projectPath: string, config: SemanthiccConfig): void {
  const configPath = join(projectPath, "semanthicc.json");
  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    cachedProjectConfig = config;
    cachedProjectPath = projectPath;
    log.api.info(`Saved project config to ${configPath}`);
  } catch (e) {
    log.api.error(`Failed to save project semanthicc.json:`, e);
    throw e;
  }
}

export function updateGlobalEmbeddingConfig(embeddingConfig: EmbeddingConfig): void {
  const config = loadGlobalConfig();
  config.embedding = { ...config.embedding, ...embeddingConfig };
  saveGlobalConfig(config);
}

export function updateProjectEmbeddingConfig(projectPath: string, embeddingConfig: EmbeddingConfig): void {
  const projectConfig = loadProjectConfig(projectPath);
  projectConfig.embedding = { ...projectConfig.embedding, ...embeddingConfig };
  saveProjectConfig(projectPath, projectConfig);
}
