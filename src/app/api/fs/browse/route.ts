import { NextResponse } from "next/server";
import { browseFilesystem } from "@/lib/fs-browse";

export const dynamic = "force-dynamic";

/** List allowed roots or child folders under a safe cwd (for repo path picker). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd");
  const result = browseFilesystem(cwd);
  return NextResponse.json(result);
}
