import { NextResponse } from "next/server";
import {
  addAgentColumn,
  moveAgentColumn,
  reorderAgentColumns,
  removeAgentColumn,
  setColumnLocked,
  listColumns,
  listVisibleColumns,
} from "@/lib/board";
import { getAgent } from "@/lib/agents";
import { getActiveWorkstreamId } from "@/lib/boards";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  if (body.action === "add") {
    const agent = getAgent(body.agentId);
    if (!agent) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
    const col = addAgentColumn(agent.id, agent.name);
    return NextResponse.json({ column: col, columns: listColumns() });
  }
  if (body.action === "lock") {
    setColumnLocked(body.columnId, Boolean(body.locked));
    return NextResponse.json({ columns: listColumns() });
  }
  if (body.action === "move") {
    const direction = Number(body.direction);
    if (direction !== -1 && direction !== 1) {
      return NextResponse.json({ error: "direction must be -1 or 1" }, { status: 400 });
    }
    try {
      const columns = moveAgentColumn(String(body.columnId), direction as -1 | 1);
      return NextResponse.json({
        columns,
        visible: listVisibleColumns(getActiveWorkstreamId()),
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 400 },
      );
    }
  }
  if (body.action === "reorder") {
    const columnIds = Array.isArray(body.columnIds)
      ? body.columnIds.map(String)
      : [];
    if (columnIds.length < 2) {
      return NextResponse.json({ error: "columnIds required" }, { status: 400 });
    }
    try {
      const columns = reorderAgentColumns(columnIds);
      return NextResponse.json({
        columns,
        visible: listVisibleColumns(getActiveWorkstreamId()),
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 400 },
      );
    }
  }
  if (body.action === "remove") {
    removeAgentColumn(body.columnId);
    return NextResponse.json({ columns: listColumns() });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
