import { NextResponse } from "next/server";
import {
  acknowledgeAlert,
  acknowledgeAllAlerts,
  countUnackedAlerts,
  listAlerts,
} from "@/lib/human/alerts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ack = url.searchParams.get("acknowledged");
  const ticketId = url.searchParams.get("ticketId") || undefined;
  const limit = Number(url.searchParams.get("limit") || 50);
  return NextResponse.json({
    alerts: listAlerts({
      acknowledged: ack === "true" ? true : ack === "false" ? false : undefined,
      ticketId,
      limit,
    }),
    unackedCount: countUnackedAlerts(),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (body.action === "ack") {
    const alert = acknowledgeAlert(String(body.id));
    return NextResponse.json({ alert, unackedCount: countUnackedAlerts() });
  }
  if (body.action === "ackAll") {
    const n = acknowledgeAllAlerts();
    return NextResponse.json({ acknowledged: n, unackedCount: 0 });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
