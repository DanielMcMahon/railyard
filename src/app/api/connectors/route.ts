import { NextResponse } from "next/server";
import {
  createCustomConnector,
  deleteConnector,
  listConnectorsPublic,
  upsertConnector,
} from "@/lib/connectors";
import type { ConnectorConfig, ConnectorKind } from "@/lib/types";
import { getSettings } from "@/lib/db";

export const dynamic = "force-dynamic";

function migrateAdoFromSettings() {
  const ado = listConnectorsPublic().find((c) => c.id === "ado");
  if (!ado) return;
  const s = getSettings();
  if ((s.adoOrg || s.adoProject) && !ado.config.org && !ado.config.project) {
    upsertConnector({
      id: "ado",
      enabled: Boolean(s.adoOrg || s.adoProject),
      config: {
        org: s.adoOrg || "",
        project: s.adoProject || "",
        query: s.adoQuery || "",
      },
    });
  }
}

export async function GET() {
  migrateAdoFromSettings();
  return NextResponse.json({ connectors: listConnectorsPublic() });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.action === "create") {
      const connector = createCustomConnector(body);
      return NextResponse.json({ connector, connectors: listConnectorsPublic() });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as Partial<ConnectorConfig> & {
      id: string;
      clearApiKey?: boolean;
    };
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    if (body.clearApiKey) {
      upsertConnector({ id: body.id, apiKey: "" }, { replaceApiKey: true });
    }
    const connector = upsertConnector(
      {
        id: body.id,
        name: body.name,
        kind: body.kind as ConnectorKind | undefined,
        enabled: body.enabled,
        baseUrl: body.baseUrl,
        config: body.config,
        notes: body.notes,
        apiKey: body.clearApiKey ? "" : body.apiKey,
      },
      {
        replaceApiKey:
          body.clearApiKey || Boolean(body.apiKey && !String(body.apiKey).startsWith("••••")),
      },
    );
    return NextResponse.json({ connector, connectors: listConnectorsPublic() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    deleteConnector(id);
    return NextResponse.json({ connectors: listConnectorsPublic() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
