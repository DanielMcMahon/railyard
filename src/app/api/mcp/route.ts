import { NextResponse } from "next/server";
import { ensureWorkstreamsReady, listTickets } from "@/lib/board";
import { getSettings } from "@/lib/db";
import { listWorkstreams } from "@/lib/workstreams";
import { budgetSnapshot } from "@/lib/cost";
import { buildAgentsMd } from "@/lib/agents-md";

export const dynamic = "force-dynamic";

/**
 * Read-only MCP-ish board status for Cursor / other clients.
 * GET returns tools + resources descriptors; POST { method, params } dispatches.
 */
export async function GET() {
  return NextResponse.json({
    name: "railyard",
    version: "0.2.0",
    description: "Read-only Railyard board status (local loopback)",
    tools: [
      {
        name: "board_status",
        description: "Active workstream columns + ticket counts by status",
      },
      {
        name: "list_tickets",
        description: "List tickets (id, title, status, workstream)",
      },
      {
        name: "agents_md",
        description: "Generated AGENTS.md snippet from the agent library",
      },
    ],
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const method = String(body.method || body.tool || "");

  if (
    method === "board_status" ||
    (method === "tools/call" && body.params?.name === "board_status")
  ) {
    const ready = ensureWorkstreamsReady();
    const settings = getSettings();
    const byStatus: Record<string, number> = {};
    for (const t of ready.tickets) {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    }
    return NextResponse.json({
      activeWorkstreamId: ready.activeWorkstreamId,
      columns: ready.columns.map((c) => ({ id: c.id, title: c.title, kind: c.kind })),
      ticketCounts: byStatus,
      dayCostUsd: budgetSnapshot().dayCostUsd,
      demoMode: settings.demoMode,
    });
  }

  if (method === "list_tickets" || body.params?.name === "list_tickets") {
    return NextResponse.json({
      tickets: listTickets().map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        workstreamId: t.workstreamId,
        columnId: t.columnId,
      })),
    });
  }

  if (method === "agents_md" || body.params?.name === "agents_md") {
    return NextResponse.json({ markdown: buildAgentsMd() });
  }

  if (method === "list_workstreams") {
    return NextResponse.json({
      workstreams: listWorkstreams().map((w) => ({
        id: w.id,
        name: w.name,
        kind: w.kind,
        stages: w.stages,
      })),
    });
  }

  return NextResponse.json({ error: `Unknown method: ${method}` }, { status: 400 });
}
