/**
 * Structured logging for workflow debugging.
 * Enable with WORKFLOW_DEBUG=1 environment variable.
 * Logs written to: %TEMP%/workflow-debug.log (or /tmp/workflow-debug.log)
 */

import { appendFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export type LogPhase = 'parse' | 'load' | 'expand' | 'guard' | 'tokenize';

export interface LogEvent {
  phase: LogPhase;
  message: string;
  data?: Record<string, unknown>;
}

const LOG_FILE = join(tmpdir(), 'workflow-debug.log');

class WorkflowLogger {
  private level: LogLevel;
  private initialized = false;

  constructor() {
    this.level = process.env.WORKFLOW_DEBUG ? LogLevel.TRACE : LogLevel.WARN;
    if (!this.initialized) {
      try {
        writeFileSync(LOG_FILE, `=== Workflow Debug Log Started: ${new Date().toISOString()} ===\n`);
        this.initialized = true;
      } catch (_) { /* Intentional: logging must never crash the app */ }
    }
  }

  private format(event: LogEvent): string {
    const ts = new Date().toISOString();
    const phase = event.phase.toUpperCase().padEnd(8);
    const data = event.data ? ` ${JSON.stringify(event.data)}` : '';
    return `[${ts}] [WF:${phase}] ${event.message}${data}`;
  }

  private writeToFile(line: string): void {
    if (this.level >= LogLevel.TRACE) {
      try {
        appendFileSync(LOG_FILE, line + '\n');
      } catch (_) { /* Intentional: logging must never crash the app */ }
    }
  }

  error(event: LogEvent): void {
    if (this.level >= LogLevel.ERROR) {
      const formatted = this.format(event);
      console.error(formatted);
      this.writeToFile(formatted);
    }
  }

  warn(event: LogEvent): void {
    if (this.level >= LogLevel.WARN) {
      const formatted = this.format(event);
      console.warn(formatted);
      this.writeToFile(formatted);
    }
  }

  info(event: LogEvent): void {
    if (this.level >= LogLevel.INFO) {
      const formatted = this.format(event);
      console.info(formatted);
      this.writeToFile(formatted);
    }
  }

  debug(event: LogEvent): void {
    if (this.level >= LogLevel.DEBUG) {
      const formatted = this.format(event);
      console.log(formatted);
      this.writeToFile(formatted);
    }
  }

  trace(event: LogEvent): void {
    if (this.level >= LogLevel.TRACE) {
      const formatted = this.format(event);
      this.writeToFile(formatted);
    }
  }

  getLogPath(): string {
    return LOG_FILE;
  }
}

export const logger = new WorkflowLogger();
