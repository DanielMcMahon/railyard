import { NextResponse } from "next/server";
import {
  createBoard,
  deleteBoard,
  getActiveBoard,
  listBoards,
  setActiveBoard,
  updateBoard,
} from "@/lib/boards";
import { ensureWorkstreamsReady } from "@/lib/board";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureWorkstreamsReady();
  return NextResponse.json({
    boards: listBoards(),
    activeBoard: getActiveBoard(),
    activeBoardId: getActiveBoard().id,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const action = String(body.action || "create");

  try {
    if (action === "activate") {
      const board = setActiveBoard(String(body.id));
      const ready = ensureWorkstreamsReady();
      return NextResponse.json({ board, ...ready, boards: listBoards() });
    }
    if (action === "create") {
      const board = createBoard({
        id: body.id,
        name: String(body.name || ""),
        color: body.color,
        repoPath: body.repoPath,
        baseRef: body.baseRef,
        worktreeRoot: body.worktreeRoot,
        branchPrefix: body.branchPrefix,
        workstreamIds: body.workstreamIds,
        activeWorkstreamId: body.activeWorkstreamId,
      });
      return NextResponse.json({ board, boards: listBoards() });
    }
    if (action === "update") {
      const board = updateBoard(String(body.id), {
        name: body.name,
        color: body.color,
        repoPath: body.repoPath,
        baseRef: body.baseRef,
        worktreeRoot: body.worktreeRoot,
        branchPrefix: body.branchPrefix,
        workstreamIds: body.workstreamIds,
        activeWorkstreamId: body.activeWorkstreamId,
      });
      const ready = ensureWorkstreamsReady();
      return NextResponse.json({ board, boards: listBoards(), ...ready });
    }
    if (action === "delete") {
      deleteBoard(String(body.id));
      const ready = ensureWorkstreamsReady();
      return NextResponse.json({ boards: listBoards(), ...ready });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
