import type { RuntimeKind } from "../types";

export type RuntimeEvent = {
  type: "tool" | "file" | "text" | "usage" | "other";
  at: string;
  label: string;
  detail?: string;
};

export interface RuntimeResult {
  ok: boolean;
  log: string;
  summary: string;
  error?: string;
  /** Estimated tokens when known */
  estimatedTokens?: number;
  /** Model id used */
  model?: string;
  /** Structured timeline events for observability */
  events?: RuntimeEvent[];
}

export type RuntimeRunInput = {
  cwd: string;
  model: string;
  prompt: string;
  autonomous: boolean;
  /** For command runtime: argv to execute */
  argv?: string[];
  onLog?: (chunk: string) => void;
  onEvent?: (event: RuntimeEvent) => void;
};

export interface AgentRuntime {
  kind: RuntimeKind | "command";
  run(input: RuntimeRunInput): Promise<RuntimeResult>;
}
