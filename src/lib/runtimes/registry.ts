import type { AgentRuntime } from "./types";
import { createOpenCodeRuntime } from "./opencode";
import { createCommandRuntime } from "./command";
import { demoRuntime } from "./demo";
import { cursorSdkRuntime } from "./cursor";

const openCodeRuntime = createOpenCodeRuntime();
const commandRuntime = createCommandRuntime();

export type RegistryKind = "demo" | "cursor" | "opencode" | "copilot" | "command";

export function resolveRuntime(kind: RegistryKind | string): AgentRuntime {
  if (kind === "command") return commandRuntime;
  if (kind === "demo") return demoRuntime;
  if (kind === "cursor") return cursorSdkRuntime;
  if (kind === "opencode") return openCodeRuntime;
  if (kind === "copilot") return demoRuntime;
  return demoRuntime;
}

export { demoRuntime, openCodeRuntime, commandRuntime, cursorSdkRuntime as cursorRuntime };
