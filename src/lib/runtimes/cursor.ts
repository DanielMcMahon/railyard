import type { AgentRuntime, RuntimeResult } from "./types";
import { demoRuntime } from "./demo";
import { getSettings } from "../db";

/**
 * Cursor Agent SDK runner (Phase 5).
 * Tries `@cursor/sdk` when installed; otherwise clear stub / demo fallback.
 */
export const cursorSdkRuntime: AgentRuntime = {
  kind: "cursor",
  async run(input): Promise<RuntimeResult> {
    const settings = getSettings();
    if (settings.demoMode) {
      return demoRuntime.run(input);
    }

    const { getProviderSecret } = await import("../providers");
    const provider = getProviderSecret("cursor");
    const apiKey = provider?.apiKey || process.env.CURSOR_API_KEY || "";
    if (!apiKey) {
      return {
        ok: false,
        log: "Cursor runtime: no API key under Providers.",
        summary: "",
        error: "Missing Cursor API key",
        model: input.model,
      };
    }

    try {
      // Avoid static resolution — package is optional until Phase 5 ships fully.
      const sdkName = ["@", "cursor", "/", "sdk"].join("");
      const mod = (await Function("n", "return import(n)")(sdkName).catch(() => null)) as {
        Agent?: { create?: unknown };
      } | null;
      if (mod?.Agent && typeof mod.Agent.create === "function") {
        input.onLog?.("[cursor] @cursor/sdk detected — streaming adapter ready for wire-up\n");
      }
    } catch {
      /* no sdk */
    }

    input.onLog?.(
      "[cursor] Agent SDK not fully wired — using local simulation with provider key present.\n",
    );
    const result = await demoRuntime.run({
      ...input,
      prompt: `${input.prompt}\n\n[cursor sdk adapter — key present, model=${input.model}]`,
    });
    return {
      ...result,
      model: input.model || "composer-2.5",
      log:
        result.log +
        "\n[cursor] Install @cursor/sdk and set Providers → Cursor key for live Agent.create streaming.\n",
    };
  },
};
