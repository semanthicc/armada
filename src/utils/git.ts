import { existsSync, statSync } from "fs";
import { dirname, join, resolve } from "path";

export function findGitRoot(cwd: string): string | null {
  let current = resolve(cwd);

  while (true) {
    const gitPath = join(current, ".git");

    if (existsSync(gitPath)) {
      const stat = statSync(gitPath);
      if (stat.isDirectory() || stat.isFile()) {
        return current;
      }
    }

    const parent = dirname(current);

    if (parent === current) {
      return null;
    }

    current = parent;
  }
}
