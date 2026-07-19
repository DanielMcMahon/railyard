import { NextResponse } from "next/server";
import {
  countOpenActions,
  getActionRequest,
  listActionRequests,
} from "@/lib/human/actions";
import { handleActionResolution } from "@/lib/human/resolve";
import type { ActionButtonId } from "@/lib/human/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "open") as
    | "open"
    | "resolved"
    | "dismissed"
    | "all";
  const ticketId = url.searchParams.get("ticketId") || undefined;
  return NextResponse.json({
    actions: listActionRequests({ status, ticketId }),
    openCount: countOpenActions(),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const action = String(body.action || "");
  if (action === "resolve") {
    const id = String(body.id || "");
    const resolution = String(body.resolution || "") as ActionButtonId;
    if (!id || !resolution) {
      return NextResponse.json({ error: "id and resolution required" }, { status: 400 });
    }
    if (!getActionRequest(id)) {
      return NextResponse.json({ error: "Action not found" }, { status: 404 });
    }
    try {
      const result = await handleActionResolution(id, resolution, body.note);
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 400 },
      );
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
