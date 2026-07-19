import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/db";
import { providerIdForRuntime, upsertProvider, getProvider } from "@/lib/providers";
import { parseBoardSettings } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getSettings());
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const next = parseBoardSettings({ ...getSettings(), ...body });

    if (next.defaultRuntime && next.defaultModel && next.defaultRuntime !== "demo") {
      const providerId = providerIdForRuntime(next.defaultRuntime);
      if (getProvider(providerId)) {
        upsertProvider({ id: providerId, defaultModel: next.defaultModel });
      }
    }

    saveSettings(next);
    return NextResponse.json(next);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
