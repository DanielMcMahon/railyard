import { NextResponse } from "next/server";
import { createLocalTicketId, updateTicketMarkdown, writeTicketMarkdown } from "@/lib/tickets-fs";
import {
  ensureWorkstreamsReady,
  insertTicket,
  listColumns,
  listTickets,
} from "@/lib/board";
import { getSettings } from "@/lib/db";
import { IMPORT_LIMITS } from "@/lib/security";
import { importAdoWorkItems } from "@/lib/ado";
import { getActiveBoard, getActiveWorkstreamId } from "@/lib/boards";

export const dynamic = "force-dynamic";

function insertImportedItem(item: {
  adoId?: string | null;
  title: string;
  description: string;
  commentCount?: number;
  labels?: string[];
  workstreamId?: string;
  source?: string;
}) {
  const settings = getSettings();
  const board = getActiveBoard();
  const defaultWs = getActiveWorkstreamId();
  const inbox = listColumns().find((c) => c.kind === "inbox");
  if (!inbox) throw new Error("No inbox");

  const title = String(item.title || "").trim().slice(0, IMPORT_LIMITS.maxTitle);
  if (!title) return null;
  const description = String(item.description || "").slice(0, IMPORT_LIMITS.maxBody);
  const labels = (Array.isArray(item.labels) ? item.labels : [])
    .map((l) => String(l).trim().slice(0, IMPORT_LIMITS.maxLabelLen))
    .filter(Boolean)
    .slice(0, IMPORT_LIMITS.maxLabels);
  const id = createLocalTicketId();
  const workstreamId = item.workstreamId || defaultWs;
  const filePath = writeTicketMarkdown({
    id,
    title,
    adoId: item.adoId ?? null,
    body: description,
    labels,
    commentCount: item.commentCount ?? 0,
  });
  updateTicketMarkdown(filePath, {
    workstreamId,
    boardId: board.id,
    source: item.source || "imported",
    externalId: item.adoId ?? null,
  });
  insertTicket({
    id,
    adoId: item.adoId ?? null,
    title,
    filePath,
    columnId: inbox.id,
    status: "inbox",
    preventAutoAdvance: settings.requireApproveForImportedTickets,
    commentCount: item.commentCount ?? 0,
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
  return id;
}

/** Import items array, or action=ado to pull from Azure DevOps connector. */
export async function POST(req: Request) {
  ensureWorkstreamsReady();
  const body = await req.json();

  if (body.action === "ado") {
    const result = await importAdoWorkItems({
      org: body.org,
      project: body.project,
      query: body.query,
    });
    if (result.error) {
      return NextResponse.json(
        { error: result.error, mode: result.mode, tickets: listTickets() },
        { status: 400 },
      );
    }
    const created: string[] = [];
    for (const item of result.items.slice(0, IMPORT_LIMITS.maxItems)) {
      const id = insertImportedItem({
        adoId: item.id,
        title: item.title,
        description: item.description,
        labels: item.labels,
        workstreamId: item.workstreamId,
        commentCount: item.commentCount,
        source: "ado",
      });
      if (id) created.push(id);
    }
    return NextResponse.json({
      mode: result.mode,
      created,
      tickets: listTickets(),
    });
  }

  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "items must be an array (or action=ado)" }, { status: 400 });
  }
  if (body.items.length > IMPORT_LIMITS.maxItems) {
    return NextResponse.json(
      { error: `Too many items (max ${IMPORT_LIMITS.maxItems})` },
      { status: 400 },
    );
  }

  for (const item of body.items as Array<{
    adoId?: string;
    title: string;
    description: string;
    commentCount?: number;
    labels?: string[];
    workstreamId?: string;
  }>) {
    insertImportedItem({ ...item, source: "imported" });
  }

  return NextResponse.json({ tickets: listTickets() });
}
