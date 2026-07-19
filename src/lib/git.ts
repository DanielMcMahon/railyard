import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { getSettings } from "./db";
import { getActiveBoard, getBoard } from "./boards";
import { WORKTREES_DIR, ensureDirs, ticketArtifactsDir } from "./paths";
import type { ChangedFile, TicketRow } from "./types";
import { assertSafeRepoPath } from "./security";

function git(cwd: string, args: string[]) {
  const res = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(res.stderr || res.stdout || `git ${args.join(" ")} failed`);
  }
  return (res.stdout || "").trim();
}

/** Soft git — returns empty string on failure instead of throwing. */
function gitSoft(cwd: string, args: string[]) {
  const res = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (res.status !== 0) return "";
  return (res.stdout || "").trim();
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function ensureSandboxRepo(baseRef: string) {
  const sandbox = path.join(process.cwd(), "data", "sandbox-repo");
  if (!fs.existsSync(path.join(sandbox, ".git"))) {
    fs.mkdirSync(sandbox, { recursive: true });
    git(sandbox, ["init"]);
    git(sandbox, ["checkout", "-b", baseRef]);
    fs.writeFileSync(path.join(sandbox, "README.md"), "# Sandbox\n");
    git(sandbox, ["add", "."]);
    git(sandbox, [
      "-c",
      "user.email=railyard@local",
      "-c",
      "user.name=Railyard",
      "commit",
      "-m",
      "init",
    ]);
  }
  return sandbox;
}

export function ensureTicketWorktree(ticket: TicketRow) {
  const settings = getSettings();
  ensureDirs();
  const board =
    (ticket.boardId && getBoard(ticket.boardId)) || getActiveBoard();
  const baseRef = ticket.baseRef || board.baseRef || settings.baseRef || "main";
  const branchPrefix = board.branchPrefix || settings.branchPrefix || "agent/";

  // Priority: ticket.repoPath → board.repoPath → settings.repoPath → sandbox
  let repo: string;
  const candidate = (ticket.repoPath || board.repoPath || settings.repoPath || "").trim();
  if (candidate) {
    repo = assertSafeRepoPath(candidate);
  } else {
    repo = ensureSandboxRepo(baseRef);
  }
  return ensureInRepo(repo, ticket, branchPrefix, baseRef);
}

function ensureInRepo(
  repo: string,
  ticket: TicketRow,
  branchPrefix: string,
  baseRef: string,
) {
  // Branch names must stay option-safe for git argv
  const rawBranch =
    ticket.branch ||
    `${branchPrefix}${ticket.adoId || ticket.id.slice(0, 8)}-${slugify(ticket.title)}`;
  const branch = rawBranch.replace(/^-/, "b-").replace(/[^A-Za-z0-9._\/-]/g, "-").slice(0, 120);
  const worktreePath = path.join(WORKTREES_DIR, ticket.id);
  if (!fs.existsSync(worktreePath)) {
    try {
      git(repo, ["rev-parse", "--verify", "--", branch]);
      git(repo, ["worktree", "add", worktreePath, branch]);
    } catch {
      git(repo, ["worktree", "add", "-b", branch, worktreePath, baseRef]);
    }
  }
  return { branch, worktreePath, repo };
}

export function commitWorktree(worktreePath: string, message: string) {
  git(worktreePath, ["add", "-A"]);
  const status = git(worktreePath, ["status", "--porcelain"]);
  if (!status) {
    return git(worktreePath, ["rev-parse", "HEAD"]);
  }
  git(worktreePath, [
    "-c",
    "user.email=railyard@local",
    "-c",
    "user.name=Railyard",
    "commit",
    "-m",
    message,
  ]);
  return git(worktreePath, ["rev-parse", "HEAD"]);
}

export function removeWorktree(repo: string, worktreePath: string) {
  if (!fs.existsSync(worktreePath)) return;
  try {
    git(repo, ["worktree", "remove", "--force", worktreePath]);
  } catch {
    fs.rmSync(worktreePath, { recursive: true, force: true });
    try {
      git(repo, ["worktree", "prune"]);
    } catch {
      /* ignore */
    }
  }
}

function parseNameStatus(raw: string): ChangedFile[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t/);
      const status = parts[0] || "?";
      // Renames: R100\told\tnew — show the new path
      const filePath = parts.length >= 3 ? parts[parts.length - 1]! : parts[1] || "";
      return { path: filePath, status: status.charAt(0) };
    })
    .filter((f) => f.path);
}

/** Files changed between baseRef and head (branch name or SHA). */
export function listChangedFiles(repo: string, baseRef: string, head: string): ChangedFile[] {
  const raw = gitSoft(repo, ["diff", "--name-status", `${baseRef}...${head}`]);
  return parseNameStatus(raw);
}

export function getRangeDiff(
  repo: string,
  baseRef: string,
  head: string,
  file?: string,
): string {
  const args = ["diff", `${baseRef}...${head}`];
  if (file) args.push("--", file);
  return gitSoft(repo, args);
}

/** Uncommitted + untracked vs HEAD inside an active worktree. */
export function getWorktreeDiff(worktreePath: string, file?: string): string {
  const args = ["diff", "HEAD"];
  if (file) args.push("--", file);
  const tracked = gitSoft(worktreePath, args);
  if (file) return tracked;
  const untracked = gitSoft(worktreePath, [
    "ls-files",
    "--others",
    "--exclude-standard",
  ]);
  if (!untracked) return tracked;
  const extras = untracked
    .split("\n")
    .filter(Boolean)
    .map((f) => {
      try {
        const content = fs.readFileSync(path.join(worktreePath, f), "utf8");
        return `diff --git a/${f} b/${f}\nnew file mode 100644\n--- /dev/null\n+++ b/${f}\n${content
          .split("\n")
          .map((l) => `+${l}`)
          .join("\n")}`;
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join("\n");
  return [tracked, extras].filter(Boolean).join("\n\n");
}

export function resolveTicketRepo(ticket: TicketRow): string {
  if (ticket.repoPath && fs.existsSync(path.join(ticket.repoPath, ".git"))) {
    return ticket.repoPath;
  }
  const board =
    (ticket.boardId && getBoard(ticket.boardId)) || getActiveBoard();
  if (board.repoPath && fs.existsSync(path.join(board.repoPath, ".git"))) {
    return board.repoPath;
  }
  const settings = getSettings();
  if (settings.repoPath && fs.existsSync(path.join(settings.repoPath, ".git"))) {
    return settings.repoPath;
  }
  return path.join(process.cwd(), "data", "sandbox-repo");
}

/** Snapshot changed files + full patch before the worktree is pruned. */
export function captureCompletionDiff(opts: {
  ticketId: string;
  repo: string;
  baseRef: string;
  head: string;
}): { files: ChangedFile[]; patch: string; artifactsDir: string } {
  ensureDirs();
  const files = listChangedFiles(opts.repo, opts.baseRef, opts.head);
  const patch = getRangeDiff(opts.repo, opts.baseRef, opts.head);
  const dir = ticketArtifactsDir(opts.ticketId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "files.json"), JSON.stringify(files, null, 2));
  fs.writeFileSync(path.join(dir, "full.patch"), patch || "");
  fs.writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify(
      {
        repo: opts.repo,
        baseRef: opts.baseRef,
        head: opts.head,
        capturedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  return { files, patch, artifactsDir: dir };
}

export function readArtifactFiles(ticketId: string): ChangedFile[] | null {
  const p = path.join(ticketArtifactsDir(ticketId), "files.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as ChangedFile[];
  } catch {
    return null;
  }
}

export function readArtifactPatch(ticketId: string, file?: string): string | null {
  const p = path.join(ticketArtifactsDir(ticketId), "full.patch");
  if (!fs.existsSync(p)) return null;
  const full = fs.readFileSync(p, "utf8");
  if (!file) return full;
  // Extract one file hunk from unified patch (best-effort)
  const marker = `diff --git a/${file} b/${file}`;
  const idx = full.indexOf(marker);
  if (idx < 0) {
    // try with just path endings
    const alt = full.split(/^diff --git /m).find((chunk) => chunk.includes(` b/${file}\n`) || chunk.endsWith(` b/${file}`));
    return alt ? `diff --git ${alt}`.trim() : null;
  }
  const rest = full.slice(idx);
  const next = rest.indexOf("\ndiff --git ", 1);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

export function getTicketDiffPayload(ticket: TicketRow, file?: string) {
  const repo = resolveTicketRepo(ticket);
  const board =
    (ticket.boardId && getBoard(ticket.boardId)) || getActiveBoard();
  const baseRef = ticket.baseRef || board.baseRef || getSettings().baseRef || "main";
  const head = ticket.branch || ticket.headSha || "HEAD";
  const worktreeAlive =
    Boolean(ticket.worktreePath) &&
    ticket.worktreePath != null &&
    fs.existsSync(ticket.worktreePath);

  let files: ChangedFile[] = [];
  try {
    files = JSON.parse(ticket.changedFilesJson || "[]") as ChangedFile[];
  } catch {
    files = [];
  }
  if (files.length === 0) {
    files = listChangedFiles(repo, baseRef, head);
  }
  if (files.length === 0) {
    files = readArtifactFiles(ticket.id) || [];
  }

  let diff = "";
  if (worktreeAlive && ticket.worktreePath) {
    const range = getRangeDiff(repo, baseRef, head, file);
    const dirty = getWorktreeDiff(ticket.worktreePath, file);
    diff = [range, dirty].filter(Boolean).join("\n\n");
  } else {
    diff = getRangeDiff(repo, baseRef, head, file);
    if (!diff) {
      diff = readArtifactPatch(ticket.id, file) || "";
    }
  }

  return {
    files,
    diff,
    meta: {
      repoPath: repo,
      worktreePath: worktreeAlive ? ticket.worktreePath : null,
      lastWorktreePath: ticket.lastWorktreePath,
      expectedWorktreePath: path.join(WORKTREES_DIR, ticket.id),
      worktreeAlive,
      branch: ticket.branch,
      baseRef,
      headSha: ticket.headSha,
      artifactsDir: ticketArtifactsDir(ticket.id),
    },
  };
}
