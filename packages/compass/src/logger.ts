import { appendFileSync } from "fs";
import { 
  type LogLevel, 
  type LogDomain, 
  shouldLog, 
  isConsoleEnabled, 
  isFileEnabled, 
  getLogFilePath,
  getLogConfig
} from "./log-config";

function timestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, domain: LogDomain, ...args: unknown[]): string {
  const config = getLogConfig();
  const msg = args.map(a => 
    typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)
  ).join(" ");
  
  if (config.jsonFormat) {
    return JSON.stringify({
      ts: config.timestamps ? timestamp() : undefined,
      level,
      domain,
      msg,
    });
  }
  
  const ts = config.timestamps ? `[${timestamp()}] ` : "";
  return `${ts}[${level.toUpperCase()}] [${domain}] ${msg}`;
}

function emit(level: LogLevel, domain: LogDomain, ...args: unknown[]): void {
  if (!shouldLog(level, domain)) return;
  
  const line = formatMessage(level, domain, ...args);
  
  if (isConsoleEnabled()) {
    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
  
  if (isFileEnabled()) {
    try {
      appendFileSync(getLogFilePath(), line + "\n", "utf-8");
    } catch {
      // Silently fail if can't write
    }
  }
}

export function createLogger(domain: LogDomain) {
  return {
    debug: (...args: unknown[]) => emit("debug", domain, ...args),
    info: (...args: unknown[]) => emit("info", domain, ...args),
    warn: (...args: unknown[]) => emit("warn", domain, ...args),
    error: (...args: unknown[]) => emit("error", domain, ...args),
  };
}

export const log = {
  api: createLogger("api"),
  db: createLogger("db"),
  index: createLogger("index"),
  search: createLogger("search"),
  dashboard: createLogger("dashboard"),
  hooks: createLogger("hooks"),
};

export { getLogFilePath } from "./log-config";
