import { getSettings, readStore, saveSettings, updateStore, migrateBoardsInStore } from "./db";
import { listWorkstreams } from "./workstreams";
import { assertSafeRepoPath, isSafeId } from "./security";
import type { BoardDef } from "./types";
import { DEFAULT_BOARD } from "./types";

export type BoardInput = {
  id?: string;
  name: string;
  color?: string;
  repoPath?: string;
  baseRef?: string;
  worktreeRoot?: string;
  branchPrefix?: string;
  workstreamIds?: string[];
  activeWorkstreamId?: string;
};

function normalizeBoard(raw: BoardDef): BoardDef {
  return {
    id: raw.id,
    name: raw.name || raw.id,
    color: raw.color || "#3d5a80",
    repoPath: raw.repoPath || "",
    baseRef: raw.baseRef || "main",
    worktreeRoot: raw.worktreeRoot,
    branchPrefix: raw.branchPrefix,
    workstreamIds: Array.isArray(raw.workstreamIds) ? raw.workstreamIds : [],
    activeWorkstreamId: raw.activeWorkstreamId || "feature",
  };
}

export function ensureBoardsMigrated(): BoardDef[] {
  const wsIds = listWorkstreams().map((w) => w.id);
  updateStore((s) => {
    migrateBoardsInStore(s, wsIds);
    // Keep default board workstream list in sync with disk if empty
    const def = s.boards?.find((b) => b.id === "default");
    if (def && (!def.workstreamIds || def.workstreamIds.length === 0) && wsIds.length) {
      def.workstreamIds = wsIds;
    }
  });
  return listBoards();
}

export function listBoards(): BoardDef[] {
  ensureBoardsMigrated();
  const store = readStore();
  return (store.boards || []).map(normalizeBoard);
}

export function getBoard(id: string): BoardDef | null {
  return listBoards().find((b) => b.id === id) || null;
}

export function getActiveBoard(): BoardDef {
  ensureBoardsMigrated();
  const settings = getSettings();
  const boards = listBoards();
  const hit =
    boards.find((b) => b.id === settings.activeBoardId) ||
    boards[0] ||
    normalizeBoard({ ...DEFAULT_BOARD });
  return hit;
}

export function setActiveBoard(boardId: string): BoardDef {
  const board = getBoard(boardId);
  if (!board) throw new Error(`Board "${boardId}" not found`);
  const settings = getSettings();
  saveSettings({
    ...settings,
    activeBoardId: board.id,
    // Mirror for legacy callers
    activeWorkstreamId: board.activeWorkstreamId,
    repoPath: board.repoPath,
    baseRef: board.baseRef,
  });
  return board;
}

export function createBoard(input: BoardInput): BoardDef {
  const id = String(input.id || input.name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!id || !isSafeId(id)) throw new Error("Invalid board id");
  if (getBoard(id)) throw new Error(`Board "${id}" already exists`);

  let repoPath = (input.repoPath || "").trim();
  if (repoPath) repoPath = assertSafeRepoPath(repoPath);

  const allWs = listWorkstreams().map((w) => w.id);
  const workstreamIds =
    input.workstreamIds && input.workstreamIds.length
      ? input.workstreamIds.filter((w) => allWs.includes(w))
      : allWs.filter((w) => w !== "demo-job");

  const board: BoardDef = {
    id,
    name: String(input.name || id).trim() || id,
    color: input.color || "#3d5a80",
    repoPath,
    baseRef: input.baseRef || "main",
    worktreeRoot: input.worktreeRoot,
    branchPrefix: input.branchPrefix,
    workstreamIds,
    activeWorkstreamId:
      input.activeWorkstreamId && workstreamIds.includes(input.activeWorkstreamId)
        ? input.activeWorkstreamId
        : workstreamIds[0] || "feature",
  };

  updateStore((s) => {
    if (!s.boards) s.boards = [];
    s.boards.push(board);
  });
  return board;
}

export function updateBoard(id: string, patch: Partial<BoardInput>): BoardDef {
  const existing = getBoard(id);
  if (!existing) throw new Error(`Board "${id}" not found`);

  let repoPath =
    patch.repoPath !== undefined ? String(patch.repoPath || "").trim() : existing.repoPath;
  if (repoPath) repoPath = assertSafeRepoPath(repoPath);

  const allWs = listWorkstreams().map((w) => w.id);
  const workstreamIds =
    patch.workstreamIds !== undefined
      ? patch.workstreamIds.filter((w) => allWs.includes(w))
      : existing.workstreamIds;

  const activeWorkstreamId =
    patch.activeWorkstreamId && workstreamIds.includes(patch.activeWorkstreamId)
      ? patch.activeWorkstreamId
      : workstreamIds.includes(existing.activeWorkstreamId)
        ? existing.activeWorkstreamId
        : workstreamIds[0] || "feature";

  const next: BoardDef = {
    ...existing,
    name: patch.name !== undefined ? String(patch.name).trim() || existing.name : existing.name,
    color: patch.color || existing.color,
    repoPath,
    baseRef: patch.baseRef || existing.baseRef,
    worktreeRoot:
      patch.worktreeRoot !== undefined ? patch.worktreeRoot : existing.worktreeRoot,
    branchPrefix:
      patch.branchPrefix !== undefined ? patch.branchPrefix : existing.branchPrefix,
    workstreamIds,
    activeWorkstreamId,
  };

  updateStore((s) => {
    if (!s.boards) s.boards = [];
    const idx = s.boards.findIndex((b) => b.id === id);
    if (idx >= 0) s.boards[idx] = next;
  });

  const settings = getSettings();
  if (settings.activeBoardId === id) {
    saveSettings({
      ...settings,
      activeWorkstreamId: next.activeWorkstreamId,
      repoPath: next.repoPath,
      baseRef: next.baseRef,
    });
  }

  return next;
}

export function deleteBoard(id: string): void {
  const boards = listBoards();
  if (boards.length <= 1) throw new Error("Cannot delete the last board");
  if (!boards.some((b) => b.id === id)) throw new Error(`Board "${id}" not found`);

  const settings = getSettings();
  updateStore((s) => {
    s.boards = (s.boards || []).filter((b) => b.id !== id);
    // Move tickets to remaining board (first)
    const fallback = s.boards[0]?.id || "default";
    for (const t of s.tickets) {
      if (t.board_id === id) t.board_id = fallback;
    }
  });

  if (settings.activeBoardId === id) {
    const next = listBoards()[0]!;
    setActiveBoard(next.id);
  }
}

/** Active workstream id for the current board (falls back to settings). */
export function getActiveWorkstreamId(): string {
  const board = getActiveBoard();
  if (board.activeWorkstreamId) return board.activeWorkstreamId;
  return getSettings().activeWorkstreamId || "feature";
}

/** Set active workstream on the active board. */
export function setActiveWorkstreamOnBoard(workstreamId: string): BoardDef {
  const board = getActiveBoard();
  if (board.workstreamIds.length && !board.workstreamIds.includes(workstreamId)) {
    throw new Error(`Workstream "${workstreamId}" is not on board "${board.id}"`);
  }
  return updateBoard(board.id, { activeWorkstreamId: workstreamId });
}

export function boardsUsingWorkstream(workstreamId: string): BoardDef[] {
  return listBoards().filter((b) => b.workstreamIds.includes(workstreamId));
}
