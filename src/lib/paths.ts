import path from "path";
import fs from "fs";

export const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");
export const DB_PATH = path.join(DATA_DIR, "railyard.db");
export const AGENTS_DIR = path.join(ROOT, "agents");
export const WORKSTREAMS_DIR = path.join(ROOT, "workstreams");
export const TICKETS_DIR = path.join(ROOT, "tickets");
export const WORKTREES_DIR = path.join(ROOT, ".worktrees");
export const ARTIFACTS_DIR = path.join(DATA_DIR, "artifacts");
export const ARCHIVE_DIR = path.join(ROOT, "Archive");
export const ARCHIVE_INDEX_PATH = path.join(DATA_DIR, "archive-index.json");

export function ensureDirs() {
  for (const dir of [
    DATA_DIR,
    AGENTS_DIR,
    WORKSTREAMS_DIR,
    TICKETS_DIR,
    WORKTREES_DIR,
    ARTIFACTS_DIR,
    ARCHIVE_DIR,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function ticketArtifactsDir(ticketId: string) {
  return path.join(ARTIFACTS_DIR, ticketId);
}
