import { spawn } from "child_process";
import { agentChildEnv, redactSecrets } from "../security";
import { estimateTokensFromText } from "../cost";
import type { AgentRuntime, RuntimeEvent, RuntimeResult } from "./types";

function formatEvent(obj: Record<string, unknown>): string | null {
  const type = String(obj.type || "");
  if (type === "text" || type === "message.part.updated") {
    const part = (obj.part as Record<string, unknown>) || obj;
    const text = String((part as { text?: string }).text || (obj as { text?: string }).text || "");
    if (text) return text;
  }
  if (type === "reasoning" || type === "thinking") {
    const text = String(
      (obj as { text?: string }).text ||
        ((obj.part as { text?: string } | undefined)?.text ?? ""),
    );
    if (text) return `\n[thinking]\n${text}\n`;
  }
  if (type === "tool_use") {
    const part = (obj.part as Record<string, unknown>) || {};
    const tool = String(part.tool || "tool");
    const title = String((part.state as { title?: string } | undefined)?.title || "");
    return `\n[tool] ${tool}${title ? ` — ${title}` : ""}\n`;
  }
  if (type === "error") {
    return `\n[error] ${JSON.stringify(obj)}\n`;
  }
  if (type && type !== "step_start" && type !== "step_finish") {
    return null;
  }
  return null;
}

function extractUsage(obj: Record<string, unknown>): number | null {
  const usage =
    (obj.usage as Record<string, unknown> | undefined) ||
    (obj.part as { usage?: Record<string, unknown> } | undefined)?.usage;
  if (!usage) return null;
  const total =
    Number(usage.totalTokens ?? usage.total_tokens ?? 0) ||
    Number(usage.inputTokens ?? usage.input_tokens ?? 0) +
      Number(usage.outputTokens ?? usage.output_tokens ?? 0);
  return total > 0 ? total : null;
}

function toTimelineEvent(obj: Record<string, unknown>): RuntimeEvent | null {
  const type = String(obj.type || "");
  const at = new Date().toISOString();
  if (type === "tool_use") {
    const part = (obj.part as Record<string, unknown>) || {};
    const tool = String(part.tool || "tool");
    const title = String((part.state as { title?: string } | undefined)?.title || "");
    const pathHint = String(
      (part.state as { input?: { path?: string; file?: string } } | undefined)?.input?.path ||
        (part.state as { input?: { path?: string; file?: string } } | undefined)?.input?.file ||
        "",
    );
    return {
      type: pathHint ? "file" : "tool",
      at,
      label: tool,
      detail: pathHint || title || undefined,
    };
  }
  if (type.includes("file") || type === "edit" || type === "write") {
    return {
      type: "file",
      at,
      label: type,
      detail: String((obj as { path?: string }).path || ""),
    };
  }
  if (extractUsage(obj) != null) {
    return { type: "usage", at, label: "tokens", detail: String(extractUsage(obj)) };
  }
  return null;
}

/** Spawn local `opencode run` with JSON stream + thinking. */
export function createOpenCodeRuntime(): AgentRuntime {
  return {
    kind: "opencode",
    async run(input): Promise<RuntimeResult> {
      const onLog = input.onLog;
      const model = input.model || "opencode-go/deepseek-v4-flash";
      const args = [
        "run",
        "--dir",
        input.cwd,
        "-m",
        model,
        "--format",
        "json",
        "--thinking",
        "--title",
        "railyard",
      ];
      if (input.autonomous) args.push("--auto");
      args.push(input.prompt);

      return await new Promise<RuntimeResult>((resolve) => {
        const child = spawn("opencode", args, {
          cwd: input.cwd,
          env: agentChildEnv(),
          stdio: ["ignore", "pipe", "pipe"],
        });

        let log = "";
        let textAcc = "";
        let buf = "";
        let estimatedTokens: number | undefined;
        const events: RuntimeEvent[] = [];

        const append = (chunk: string) => {
          const safe = redactSecrets(chunk);
          log += safe;
          onLog?.(safe);
        };

        const handleLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          try {
            const obj = JSON.parse(trimmed) as Record<string, unknown>;
            const tokens = extractUsage(obj);
            if (tokens) estimatedTokens = tokens;
            const ev = toTimelineEvent(obj);
            if (ev) {
              events.push(ev);
              input.onEvent?.(ev);
            }
            const formatted = formatEvent(obj);
            if (formatted) {
              append(formatted);
              if (
                obj.type === "text" ||
                (obj.part as { type?: string } | undefined)?.type === "text"
              ) {
                textAcc += formatted;
              }
            }
          } catch {
            append(trimmed + "\n");
          }
        };

        child.stdout?.on("data", (data: Buffer) => {
          buf += data.toString("utf8");
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) handleLine(line);
        });

        child.stderr?.on("data", (data: Buffer) => {
          append(`[stderr] ${data.toString("utf8")}`);
        });

        child.on("error", (err) => {
          resolve({
            ok: false,
            log,
            summary: "",
            error: err.message,
            model,
            estimatedTokens: estimatedTokens ?? estimateTokensFromText(input.prompt + log),
            events,
          });
        });

        child.on("close", (code) => {
          if (buf.trim()) handleLine(buf);
          const summary =
            textAcc.trim().slice(-2000) ||
            (code === 0 ? "OpenCode finished with no text events." : `OpenCode exited ${code}`);
          resolve({
            ok: code === 0,
            log,
            summary,
            error: code === 0 ? undefined : `opencode exited with code ${code}`,
            model,
            estimatedTokens: estimatedTokens ?? estimateTokensFromText(input.prompt + log),
            events,
          });
        });
      });
    },
  };
}
