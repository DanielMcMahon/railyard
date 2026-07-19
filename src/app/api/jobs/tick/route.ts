import { NextResponse } from "next/server";
import { listJobQueue, tickJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/** External cron can hit this endpoint on loopback. */
export async function POST() {
  const result = await tickJobs();
  return NextResponse.json({ ...result, queue: listJobQueue() });
}

export async function GET() {
  return NextResponse.json(listJobQueue());
}
