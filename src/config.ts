import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { log } from "./logger";

export interface SemanthiccConfig {
  dashboard?: "auto" | "manual";
  port?: number;
  logLevel?: "debug" | "info" | "warn" | "error";
}

export function loadConfig(projectPath: string): SemanthiccConfig {
  try {
    const configPath = join(projectPath, "semanthicc.json");
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      const config = JSON.parse(content);
      log.api.debug(`Loaded config from ${configPath}:`, config);
      return config;
    }
  } catch (e) {
    log.api.warn(`Failed to load semanthicc.json:`, e);
  }
  return {};
}
