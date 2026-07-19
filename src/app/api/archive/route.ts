import { NextResponse } from "next/server";
import {
  listArchiveIndex,
  readArchiveSummary,
  searchArchives,
  type ArchiveSearchQuery,
} from "@/lib/archive";
import { ARCHIVE_DIR } from "@/lib/paths";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const pathParam = url.searchParams.get("path");
  if (pathParam) {
    const summary = readArchiveSummary(pathParam);
    if (!summary) {
      return NextResponse.json({ error: "Archive not found" }, { status: 404 });
    }
    const full = path.isAbsolute(pathParam)
      ? pathParam
      : path.join(ARCHIVE_DIR, pathParam);
    const files = fs.existsSync(full)
      ? fs.readdirSync(full, { withFileTypes: true }).map((e) => e.name)
      : [];
    return NextResponse.json({ summary, files, path: pathParam });
  }

  const query: ArchiveSearchQuery = {
    q: url.searchParams.get("q") || undefined,
    agent: url.searchParams.get("agent") || undefined,
    workstream: url.searchParams.get("workstream") || undefined,
    repo: url.searchParams.get("repo") || undefined,
    branch: url.searchParams.get("branch") || undefined,
    label: url.searchParams.get("label") || undefined,
    model: url.searchParams.get("model") || undefined,
    runtime: url.searchParams.get("runtime") || undefined,
    outcome: url.searchParams.get("outcome") || undefined,
    minCost: url.searchParams.get("minCost")
      ? Number(url.searchParams.get("minCost"))
      : undefined,
    requiredHumanApproval:
      url.searchParams.get("requiredHumanApproval") === "true"
        ? true
        : undefined,
    from: url.searchParams.get("from") || undefined,
    to: url.searchParams.get("to") || undefined,
  };

  const hasFilter = Object.values(query).some((v) => v !== undefined && v !== "");
  const entries = hasFilter ? searchArchives(query) : listArchiveIndex();
  return NextResponse.json({ archives: entries, count: entries.length });
}
