import { NextResponse } from "next/server";
import { buildAgentsMd, writeAgentsMd } from "@/lib/agents-md";

export const dynamic = "force-dynamic";

export async function GET() {
  return new NextResponse(buildAgentsMd(), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export async function POST() {
  const path = writeAgentsMd();
  return NextResponse.json({ path, markdown: buildAgentsMd() });
}
