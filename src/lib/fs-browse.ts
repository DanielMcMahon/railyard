import fs from "fs";
import path from "path";
import { getAllowedRepoRoots } from "./security";

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  "__pycache__",
  ".cache",
  ".Trash",
  "Library",
  "Applications",
  ".cursor",
  ".npm",
  ".local",
  ".config",
  ".ssh",
  ".gnupg",
  ".aws",
  ".azure",
]);

export type BrowseEntry = {
  name: string;
  path: string;
  isGitRepo: boolean;
  hasChildren: boolean;
};

export type BrowseResult = {
  roots: string[];
  cwd: string | null;
  parent: string | null;
  entries: BrowseEntry[];
  cwdIsGitRepo: boolean;
  error?: string;
};

function resolveUnderRoots(target: string, roots: string[]): string | null {
  const trimmed = (target || "").trim();
  if (!trimmed) return null;
  if (!fs.existsSync(trimmed)) return null;
  let resolved: string;
  try {
    resolved = fs.realpathSync(trimmed);
  } catch {
    return null;
  }
  if (!fs.statSync(resolved).isDirectory()) return null;
  const ok = roots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
  return ok ? resolved : null;
}

function isGitRepoDir(dir: string): boolean {
  return fs.existsSync(path.join(dir, ".git"));
}

function dirHasListableChildren(dir: string): boolean {
  try {
    const names = fs.readdirSync(dir);
    return names.some((name) => {
      if (SKIP_DIR_NAMES.has(name) || name.startsWith(".")) return false;
      try {
        return fs.statSync(path.join(dir, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/** List browse roots, or children of `cwd` if under an allowed root. */
export function browseFilesystem(cwdRaw?: string | null): BrowseResult {
  const roots = getAllowedRepoRoots();
  const cwd = resolveUnderRoots(cwdRaw || "", roots);

  if (cwdRaw && cwdRaw.trim() && !cwd) {
    return {
      roots,
      cwd: null,
      parent: null,
      entries: roots.map((r) => ({
        name: path.basename(r) || r,
        path: r,
        isGitRepo: isGitRepoDir(r),
        hasChildren: dirHasListableChildren(r),
      })),
      cwdIsGitRepo: false,
      error: "Path is outside allowed roots or does not exist",
    };
  }

  if (!cwd) {
    return {
      roots,
      cwd: null,
      parent: null,
      entries: roots.map((r) => ({
        name: path.basename(r) || r,
        path: r,
        isGitRepo: isGitRepoDir(r),
        hasChildren: dirHasListableChildren(r),
      })),
      cwdIsGitRepo: false,
    };
  }

  const parentCandidate = path.dirname(cwd);
  const parent =
    parentCandidate !== cwd ? resolveUnderRoots(parentCandidate, roots) : null;

  let names: string[] = [];
  try {
    names = fs.readdirSync(cwd);
  } catch (err) {
    return {
      roots,
      cwd,
      parent,
      entries: [],
      cwdIsGitRepo: isGitRepoDir(cwd),
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const entries: BrowseEntry[] = [];
  for (const name of names) {
    if (SKIP_DIR_NAMES.has(name)) continue;
    if (name.startsWith(".")) continue;
    const full = path.join(cwd, name);
    let st: fs.Stats;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    entries.push({
      name,
      path: full,
      isGitRepo: isGitRepoDir(full),
      hasChildren: dirHasListableChildren(full),
    });
  }

  entries.sort((a, b) => {
    if (a.isGitRepo !== b.isGitRepo) return a.isGitRepo ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    roots,
    cwd,
    parent,
    entries,
    cwdIsGitRepo: isGitRepoDir(cwd),
  };
}
