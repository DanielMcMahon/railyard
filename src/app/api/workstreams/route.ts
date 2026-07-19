import { NextResponse } from "next/server";
import {
  createWorkstream,
  deleteWorkstream,
  getWorkstream,
  listWorkstreams,
  updateWorkstream,
} from "@/lib/workstreams";
import { setActiveWorkstream, syncWorkstreamColumns } from "@/lib/board";
import type { CompleteAction, JobTrigger, WorkstreamKind } from "@/lib/types";
import { normalizeStages } from "@/lib/workstreams";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    workstreams: listWorkstreams(),
  });
}

export async function POST(req: Request) {
  const body = await req.json();

  if (body.action === "create") {
    const ws = createWorkstream({
      id: String(body.id || body.name || ""),
      name: String(body.name || body.id || ""),
      kind: (body.kind as WorkstreamKind) || "pipeline",
      color: String(body.color || "#3d5a80"),
      stages: normalizeStages(body.stages),
      git: body.git !== false,
      completeAction: (body.completeAction as CompleteAction) || "commit_and_pr",
      defaultLabels: Array.isArray(body.defaultLabels)
        ? body.defaultLabels.map(String)
        : [],
      trigger: (body.trigger as JobTrigger) || null,
      defaultOnFailureAgentId:
        body.defaultOnFailureAgentId != null
          ? String(body.defaultOnFailureAgentId || "") || null
          : null,
      onRequestChangesAgentId:
        body.onRequestChangesAgentId != null
          ? String(body.onRequestChangesAgentId || "") || null
          : null,
      notes: body.notes != null ? String(body.notes) : "",
    });
    syncWorkstreamColumns(ws.id);
    return NextResponse.json({ workstream: ws, workstreams: listWorkstreams() });
  }

  if (body.action === "update") {
    const id = String(body.id || "");
    if (!getWorkstream(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const ws = updateWorkstream(id, {
      id: body.nextId != null ? String(body.nextId) : id,
      name: String(body.name || id),
      kind: (body.kind as WorkstreamKind) || "pipeline",
      color: String(body.color || "#3d5a80"),
      stages: normalizeStages(body.stages),
      git: body.git !== false,
      completeAction: (body.completeAction as CompleteAction) || "commit_and_pr",
      defaultLabels: Array.isArray(body.defaultLabels)
        ? body.defaultLabels.map(String)
        : [],
      trigger: (body.trigger as JobTrigger) || null,
      defaultOnFailureAgentId:
        body.defaultOnFailureAgentId != null
          ? String(body.defaultOnFailureAgentId || "") || null
          : null,
      onRequestChangesAgentId:
        body.onRequestChangesAgentId != null
          ? String(body.onRequestChangesAgentId || "") || null
          : null,
      notes: body.notes != null ? String(body.notes) : "",
    });
    // If renamed, sync under new id and drop old columns via sync of all
    syncWorkstreamColumns(ws.id);
    return NextResponse.json({ workstream: ws, workstreams: listWorkstreams() });
  }

  if (body.action === "delete") {
    try {
      deleteWorkstream(String(body.id));
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 400 },
      );
    }
    return NextResponse.json({ workstreams: listWorkstreams() });
  }

  if (body.action === "activate") {
    try {
      const ready = setActiveWorkstream(String(body.id));
      return NextResponse.json({
        activeWorkstreamId: ready.activeWorkstreamId,
        columns: ready.columns,
        tickets: ready.tickets,
        workstreams: listWorkstreams(),
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
