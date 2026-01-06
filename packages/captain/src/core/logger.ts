import { appendFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DEBUG_CONFIG } from './debug-config';

const LOG_FILE = join(tmpdir(), 'opencode-captain.log');

function timestamp(): string {
  return new Date().toISOString();
}

export function log(category: keyof typeof DEBUG_CONFIG, ...args: unknown[]): void {
  if (!DEBUG_CONFIG.enabled) return;
  if (category !== 'enabled' && !DEBUG_CONFIG[category]) return;
  
  const message = args.map(a => 
    typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
  ).join(' ');
  appendFileSync(LOG_FILE, `[${timestamp()}] [${category}] ${message}\n`, 'utf-8');
}

export function clearLog(): void {
  writeFileSync(LOG_FILE, '', 'utf-8');
}

export function getLogPath(): string {
  return LOG_FILE;
}
