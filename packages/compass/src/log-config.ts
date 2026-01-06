import { tmpdir } from "os";
import { join } from "path";

export type LogLevel = "debug" | "info" | "warn" | "error" | "none";
export type LogOutput = "console" | "file" | "both";
export type LogDomain = "api" | "db" | "index" | "search" | "dashboard" | "hooks" | "all";

export interface LogConfig {
  level: LogLevel;
  output: LogOutput;
  filePath: string;
  enabledDomains: LogDomain[];
  timestamps: boolean;
  jsonFormat: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 99,
};

// Set to "both" to see logs in console during debugging
const DEFAULT_CONFIG: LogConfig = {
  level: "debug",
  output: "file",  // "file" | "console" | "both"
  filePath: join(tmpdir(), "semanthicc.log"),
  enabledDomains: ["all"],
  timestamps: true,
  jsonFormat: false,
};

let currentConfig: LogConfig = { ...DEFAULT_CONFIG };

export function getLogConfig(): LogConfig {
  return { ...currentConfig };
}

export function setLogConfig(partial: Partial<LogConfig>): void {
  currentConfig = { ...currentConfig, ...partial };
}

export function resetLogConfig(): void {
  currentConfig = { ...DEFAULT_CONFIG };
}

export function shouldLog(level: LogLevel, domain: LogDomain): boolean {
  if (currentConfig.level === "none") return false;
  if (LOG_LEVELS[level] < LOG_LEVELS[currentConfig.level]) return false;
  if (!currentConfig.enabledDomains.includes("all") && !currentConfig.enabledDomains.includes(domain)) return false;
  return true;
}

export function isConsoleEnabled(): boolean {
  return currentConfig.output === "console" || currentConfig.output === "both";
}

export function isFileEnabled(): boolean {
  return currentConfig.output === "file" || currentConfig.output === "both";
}

export function getLogFilePath(): string {
  return currentConfig.filePath;
}
