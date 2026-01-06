import { basename } from "path";
import { findGitRoot } from "../utils/git";
import { getCurrentProject, registerProject } from "./project-detect";
import type { Project } from "../types";

export function getOrCreateProject(cwd: string): Project | null {
  const existing = getCurrentProject(cwd);
  if (existing) return existing;

  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) return null;

  const name = basename(gitRoot);
  return registerProject(gitRoot, name);
}
