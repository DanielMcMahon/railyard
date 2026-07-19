import { spawn } from "child_process";
import { agentChildEnv, redactSecrets } from "../security";
import type { AgentRuntime, RuntimeResult } from "./types";

/** Non-LLM stage runner — executes argv in the ticket worktree. */
export function createCommandRuntime(): AgentRuntime {
  return {
    kind: "command",
    async run(input): Promise<RuntimeResult> {
      const argv = input.argv;
      if (!argv?.length) {
        return {
          ok: false,
          log: "command runtime: missing argv",
          summary: "",
          error: "Missing command argv",
        };
      }
      const [cmd, ...args] = argv;
      const onLog = input.onLog;
      const started = new Date().toISOString();
      input.onEvent?.({
        type: "tool",
        at: started,
        label: cmd!,
        detail: args.join(" "),
      });

      return await new Promise((resolve) => {
        const child = spawn(cmd!, args, {
          cwd: input.cwd,
          env: agentChildEnv(),
          stdio: ["ignore", "pipe", "pipe"],
        });
        let log = "";
        const append = (chunk: string) => {
          const safe = redactSecrets(chunk);
          log += safe;
          onLog?.(safe);
        };
        child.stdout?.on("data", (d: Buffer) => append(d.toString("utf8")));
        child.stderr?.on("data", (d: Buffer) => append(d.toString("utf8")));
        child.on("error", (err) => {
          resolve({
            ok: false,
            log,
            summary: "",
            error: err.message,
            events: [
              {
                type: "tool",
                at: started,
                label: cmd!,
                detail: err.message,
              },
            ],
          });
        });
        child.on("close", (code) => {
          const ok = code === 0;
          const summary = ok
            ? `Command succeeded: ${argv.join(" ")}`
            : `Command failed (exit ${code}): ${argv.join(" ")}`;
          append(`\n[${summary}]\n`);
          resolve({
            ok,
            log,
            summary,
            error: ok ? undefined : summary,
            events: [
              {
                type: "tool",
                at: started,
                label: cmd!,
                detail: `exit ${code}`,
              },
            ],
          });
        });
      });
    },
  };
}
