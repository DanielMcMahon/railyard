import { NextResponse } from "next/server";
import { listModelsForProvider, listRuntimeOptions, providerIdForRuntime } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("runtimes") === "1") {
    return NextResponse.json({ runtimes: listRuntimeOptions() });
  }
  const runtime = searchParams.get("runtime") || searchParams.get("providerId") || "demo";
  const providerId = providerIdForRuntime(runtime);
  const models = await listModelsForProvider(providerId);
  return NextResponse.json({ providerId, models });
}
