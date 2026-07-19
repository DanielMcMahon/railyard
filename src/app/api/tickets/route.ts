import { NextResponse } from "next/server";
import {
  deleteTicket,
  ensureBaseColumns,
  ensureWorkstreamsReady,
  getColumn,
  getTicket,
  insertTicket,
  listAgentColumnsForTicket,
  listColumns,
  listTickets,
  moveTicket,
  updateTicket,
} from "@/lib/board";
import {
  approveTicket,
  completeTicket,
  getTicketDetail,
  rejectTicket,
  requestChangesTicket,
  scheduleBoard,
  scheduleColumn,
} from "@/lib/orchestrator";
import {
  createLocalTicketId,
  deleteTicketFile,
  updateTicketMarkdown,
  writeTicketMarkdown,
} from "@/lib/tickets-fs";
import { getWorkstream } from "@/lib/workstreams";
import { getActiveBoard, getActiveWorkstreamId } from "@/lib/boards";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ tickets: listTickets() });
}

/** Create a local ticket (no connector required). */
export async function POST(req: Request) {
  ensureWorkstreamsReady();
  const body = await req.json();
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const inbox = listColumns().find((c) => c.kind === "inbox");
  if (!inbox) return NextResponse.json({ error: "No inbox" }, { status: 500 });

  const board = getActiveBoard();
  const workstreamId =
    (body.workstreamId && String(body.workstreamId)) ||
    getActiveWorkstreamId() ||
    "feature";
  const ws = getWorkstream(workstreamId);
  const labels = Array.isArray(body.labels)
    ? body.labels
    : [...(ws?.defaultLabels || [])];

  const id = createLocalTicketId();
  const markdownBody =
    body.body ||
    `## Description\n\n${body.description || ""}\n\n## Acceptance Criteria\n\n- \n`;
  const filePath = writeTicketMarkdown({
    id,
    title,
    adoId: body.externalId || body.adoId || null,
    body: markdownBody,
    labels,
    commentCount: body.commentCount ?? 0,
  });
  updateTicketMarkdown(filePath, {
    source: body.source || "local",
    externalId: body.externalId || body.adoId || null,
    workstreamId,
    boardId: board.id,
  });

  insertTicket({
    id,
    adoId: body.externalId || body.adoId || null,
    title,
    filePath,
    columnId: body.columnId || inbox.id,
    status: "inbox",
    preventAutoAdvance: false,
    commentCount: body.commentCount ?? 0,
    workstreamId,
    boardId: board.id,
    branch: null,
    worktreePath: null,
    lastWorktreePath: null,
    repoPath: board.repoPath || null,
    baseRef: board.baseRef || null,
    headSha: null,
    prUrl: null,
    failureReason: null,
    changedFilesJson: "[]",
    labelsJson: JSON.stringify(labels),
    currentNodeId: null,
  });

  return NextResponse.json({ ticket: getTicket(id), tickets: listTickets() });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { ticketId } = body;

  if (body.action === "move") {
    const col = getColumn(body.toColumnId);
    if (!col) return NextResponse.json({ error: "Column missing" }, { status: 404 });
    const id = String(ticketId || "").replace(/^ticket:/, "");
    if (!getTicket(id)) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    moveTicket(id, body.toColumnId, body.toIndex ?? 0);
    if (col.kind === "agent") {
      updateTicket(id, {
        status: "queued",
        workstreamId: col.workstreamId || getTicket(id)?.workstreamId || null,
      });
      void scheduleColumn(col.id).catch((err) => {
        console.error("scheduleColumn failed", err);
      });
    } else if (col.kind === "complete") {
      await completeTicket(id);
    } else if (col.kind === "inbox") {
      updateTicket(id, { status: "inbox" });
    } else if (col.kind === "needs_human") {
      updateTicket(id, { status: "needs_human" });
    }
    return NextResponse.json({ tickets: listTickets() });
  }

  if (body.action === "togglePreventAutoAdvance") {
    const t = listTickets().find((x) => x.id === ticketId);
    if (!t) return NextResponse.json({ error: "Missing" }, { status: 404 });
    updateTicket(ticketId, { preventAutoAdvance: !t.preventAutoAdvance });
    return NextResponse.json({ tickets: listTickets() });
  }

  if (body.action === "resume" || body.action === "retry") {
    const needs = listTickets().find((x) => x.id === ticketId);
    if (!needs) return NextResponse.json({ error: "Missing" }, { status: 404 });
    const col = getColumn(needs.columnId);
    if (col?.kind === "needs_human") {
      const agentCols = listAgentColumnsForTicket(needs);
      const agentCol = agentCols[0];
      if (agentCol) {
        moveTicket(ticketId, agentCol.id, 0);
        updateTicket(ticketId, {
          status: "queued",
          workstreamId: needs.workstreamId || agentCol.workstreamId,
          failureReason: body.action === "retry" ? null : needs.failureReason,
        });
      }
    }
    const { runAgentOnTicket } = await import("@/lib/orchestrator");
    void runAgentOnTicket(ticketId, { mode: body.action }).catch((err) => {
      console.error("runAgentOnTicket failed", err);
    });
    return NextResponse.json({ tickets: listTickets() });
  }

  if (body.action === "schedule") {
    void scheduleBoard().catch((err) => console.error("scheduleBoard failed", err));
    return NextResponse.json({ tickets: listTickets() });
  }

  if (body.action === "update") {
    const ticket = getTicket(ticketId);
    if (!ticket) return NextResponse.json({ error: "Missing" }, { status: 404 });
    const title = body.title !== undefined ? String(body.title).trim() : ticket.title;
    const labels = body.labels !== undefined ? body.labels : JSON.parse(ticket.labelsJson || "[]");
    updateTicketMarkdown(ticket.filePath, {
      title,
      body: body.body,
      labels,
      adoId: body.adoId !== undefined ? body.adoId : undefined,
      externalId: body.externalId,
      source: body.source,
      commentCount: body.commentCount,
    });
    updateTicket(ticketId, {
      title,
      labelsJson: JSON.stringify(labels),
      adoId: body.adoId !== undefined ? body.adoId : ticket.adoId,
      commentCount: body.commentCount ?? ticket.commentCount,
    });
    return NextResponse.json({ detail: getTicketDetail(ticketId), tickets: listTickets() });
  }

  if (body.action === "delete") {
    const ticket = getTicket(ticketId);
    if (!ticket) return NextResponse.json({ error: "Missing" }, { status: 404 });
    deleteTicketFile(ticket.filePath);
    deleteTicket(ticketId);
    return NextResponse.json({ tickets: listTickets() });
  }

  if (body.action === "approve") {
    try {
      await approveTicket(ticketId);
      return NextResponse.json({ detail: getTicketDetail(ticketId), tickets: listTickets() });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 400 },
      );
    }
  }

  if (body.action === "requestChanges") {
    await requestChangesTicket(ticketId);
    return NextResponse.json({ detail: getTicketDetail(ticketId), tickets: listTickets() });
  }

  if (body.action === "reject") {
    await rejectTicket(ticketId);
    return NextResponse.json({ detail: getTicketDetail(ticketId), tickets: listTickets() });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
