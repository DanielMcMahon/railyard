import { NextResponse } from "next/server";
import { ensureWorkstreamsReady, listTickets } from "@/lib/board";
import { listAgents } from "@/lib/agents";
import { listWorkstreams } from "@/lib/workstreams";
import { getSettings } from "@/lib/db";
import { budgetSnapshot, sumTicketCostUsd } from "@/lib/cost";

export const dynamic = "force-dynamic";

export async function GET() {
  const ready = ensureWorkstreamsReady();
  const ticketCosts: Record<string, number> = {};
  for (const t of listTickets()) {
    ticketCosts[t.id] = sumTicketCostUsd(t.id);
  }
  return NextResponse.json({
    settings: getSettings(),
    columns: ready.columns,
    tickets: ready.tickets,
    agents: listAgents().map(({ prompt: _p, ...a }) => a),
    workstreams: listWorkstreams().map(({ notes: _n, ...w }) => w),
    activeWorkstreamId: ready.activeWorkstreamId,
    dayCostUsd: budgetSnapshot().dayCostUsd,
    ticketCosts,
  });
}
