export const DEBUG_CONFIG = {
  enabled: false,
  logHighlight: false,
  logAutomention: false,
  logExpansion: false,
  logHooks: false,
} as const;

export type DebugConfig = typeof DEBUG_CONFIG;
