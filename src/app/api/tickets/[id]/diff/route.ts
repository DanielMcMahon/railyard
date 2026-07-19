import { NextResponse } from "next/server";
import { getTicket } from "@/lib/board";
import { getTicketDiffPayload } from "@/lib/git";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const ticket = getTicket(id);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const file = url.searchParams.get("file") || undefined;
  const payload = getTicketDiffPayload(ticket, file || undefined);
  return NextResponse.json(payload);
}
