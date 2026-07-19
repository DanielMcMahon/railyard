import { NextResponse } from "next/server";
import { ensureWorkstreamsReady, listTickets } from "@/lib/board";
import { listAgents } from "@/lib/agents";
import { listWorkstreams } from "@/lib/workstreams";
import { getSettings } from "@/lib/db";
import { budgetSnapshot, sumTicketCostUsd } from "@/lib/cost";
import { getActiveBoard, listBoards } from "@/lib/boards";

export const dynamic = "force-dynamic";

export async function GET() {
  const ready = ensureWorkstreamsReady();
  const board = getActiveBoard();
  const boardTickets = ready.tickets;
  const ticketCosts: Record<string, number> = {};
  for (const t of boardTickets) {
    ticketCosts[t.id] = sumTicketCostUsd(t.id);
  }
  const boardWsIds = new Set(
    board.workstreamIds.length
      ? board.workstreamIds
      : listWorkstreams().map((w) => w.id),
  );
  return NextResponse.json({
    settings: getSettings(),
    columns: ready.columns,
    tickets: boardTickets,
    agents: listAgents().map(({ prompt: _p, ...a }) => a),
    workstreams: listWorkstreams()
      .filter((w) => boardWsIds.has(w.id))
      .map(({ notes: _n, ...w }) => w),
    boards: listBoards(),
    activeBoardId: ready.activeBoardId || board.id,
    activeBoard: ready.activeBoard || board,
    activeWorkstreamId: ready.activeWorkstreamId,
    dayCostUsd: budgetSnapshot().dayCostUsd,
    ticketCosts,
    allTicketCount: listTickets().length,
  });
}
