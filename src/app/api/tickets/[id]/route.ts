import { NextResponse } from "next/server";
import { getTicketDetail } from "@/lib/orchestrator";
import { getTicket, updateTicket } from "@/lib/board";
import { updateTicketMarkdown } from "@/lib/tickets-fs";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const detail = getTicketDetail(id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const ticket = getTicket(id);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const title = body.title !== undefined ? String(body.title).trim() : ticket.title;
  const labels = body.labels !== undefined ? body.labels : JSON.parse(ticket.labelsJson || "[]");
  updateTicketMarkdown(ticket.filePath, {
    title,
    body: body.body,
    labels,
    externalId: body.externalId,
    source: body.source,
  });
  updateTicket(id, {
    title,
    labelsJson: JSON.stringify(labels),
  });
  return NextResponse.json(getTicketDetail(id));
}
