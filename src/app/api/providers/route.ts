import { NextResponse } from "next/server";
import {
  createCustomProvider,
  deleteProvider,
  listProvidersPublic,
  upsertProvider,
} from "@/lib/providers";
import type { ProviderConfig, ProviderKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ providers: listProvidersPublic() });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.action === "create") {
      const provider = createCustomProvider(body);
      return NextResponse.json({ provider, providers: listProvidersPublic() });
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
    const body = (await req.json()) as Partial<ProviderConfig> & {
      id: string;
      clearApiKey?: boolean;
    };
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

    if (body.clearApiKey) {
      upsertProvider({ id: body.id, apiKey: "" }, { replaceApiKey: true });
    }

    const provider = upsertProvider(
      {
        id: body.id,
        name: body.name,
        kind: body.kind as ProviderKind | undefined,
        enabled: body.enabled,
        baseUrl: body.baseUrl,
        defaultModel: body.defaultModel,
        notes: body.notes,
        apiKey: body.clearApiKey ? "" : body.apiKey,
      },
      { replaceApiKey: body.clearApiKey || Boolean(body.apiKey && !String(body.apiKey).startsWith("••••")) },
    );
    return NextResponse.json({ provider, providers: listProvidersPublic() });
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
    deleteProvider(id);
    return NextResponse.json({ providers: listProvidersPublic() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
