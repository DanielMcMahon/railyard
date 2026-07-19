import { NextResponse } from "next/server";
import { listJobQueue, tickJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listJobQueue());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.action === "tick" || !body.action) {
    const result = await tickJobs();
    return NextResponse.json({ ...result, queue: listJobQueue() });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
