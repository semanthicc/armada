export const HARD_EXCLUDE = [
  ".env*",
  "*.pem",
  "*.key",
  "**/credentials*",
  "**/secrets*",
  ".git/**",
  "node_modules/**",
  "vendor/**",
  "venv/**",
  ".venv/**",
  "__pycache__/**",
  ".cargo/**",
  "target/**",
  "dist/**",
  "build/**",
  ".next/**",
  "out/**",
  ".output/**",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock",
  "composer.lock",
  ".idea/**",
  ".vscode/**",
  "*.swp",
  "*.swo",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.ico",
  "*.webp",
  "*.svg",
  "*.woff",
  "*.woff2",
  "*.ttf",
  "*.eot",
  "*.zip",
  "*.tar",
  "*.gz",
  "*.rar",
  "*.pdf",
  "*.doc",
  "*.docx",
  "*.mp3",
  "*.mp4",
  "*.wav",
  "*.avi",
  "*.exe",
  "*.dll",
  "*.so",
  "*.dylib",
  "*.db",
  "*.sqlite",
  "*.sqlite3",
] as const;

export const CODE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".rb",
  ".php",
  ".swift",
  ".scala",
  ".vue",
  ".svelte",
  ".astro",
  ".md",
  ".mdx",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".sql",
  ".graphql",
  ".gql",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".ps1",
  ".dockerfile",
  ".tf",
  ".hcl",
] as const;

export function isCodeFile(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return CODE_EXTENSIONS.includes(ext as (typeof CODE_EXTENSIONS)[number]);
}

export function matchesPattern(path: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/{{GLOBSTAR}}/g, ".*")
    .replace(/\?/g, ".");
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

export function shouldExclude(relativePath: string): boolean {
  const normalizedPath = relativePath.replace(/\\/g, "/");
  
  for (const pattern of HARD_EXCLUDE) {
    if (matchesPattern(normalizedPath, pattern)) {
      return true;
    }
    if (normalizedPath.includes(pattern.replace(/\*\*/g, "").replace(/\*/g, ""))) {
      const simpleMatch = pattern.replace(/\*\*/g, "").replace(/\*/g, "");
      if (simpleMatch && normalizedPath.includes(simpleMatch)) {
        return true;
      }
    }
  }
  
  return false;
}
