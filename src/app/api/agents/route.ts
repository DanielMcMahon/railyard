import { NextResponse } from "next/server";
import {
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  updateAgent,
  type AgentInput,
} from "@/lib/agents";
import type { RuntimeKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ agents: listAgents() });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<AgentInput>;
    if (!body.id || !body.name) {
      return NextResponse.json({ error: "id and name are required" }, { status: 400 });
    }
    const agent = createAgent({
      id: body.id,
      name: body.name,
      runtime: (body.runtime as RuntimeKind) || "cursor",
      model: body.model || "composer-2.5",
      autonomous: body.autonomous !== false,
      color: body.color || "#5c6b73",
      prompt: body.prompt || "",
      canSpawn: body.canSpawn === true,
    });
    return NextResponse.json({ agent, agents: listAgents() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as Partial<AgentInput> & { originalId?: string };
    const originalId = body.originalId || body.id;
    if (!originalId) {
      return NextResponse.json({ error: "originalId required" }, { status: 400 });
    }
    if (!getAgent(originalId)) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    const agent = updateAgent(originalId, {
      id: body.id || originalId,
      name: body.name || originalId,
      runtime: (body.runtime as RuntimeKind) || "cursor",
      model: body.model || "composer-2.5",
      autonomous: body.autonomous !== false,
      color: body.color || "#5c6b73",
      prompt: body.prompt ?? "",
      canSpawn: body.canSpawn === true,
    });
    return NextResponse.json({ agent, agents: listAgents() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    deleteAgent(id);
    return NextResponse.json({ agents: listAgents() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
