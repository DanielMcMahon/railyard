import { spawn } from "child_process";
import { agentChildEnv, redactSecrets } from "../security";
import type { AgentResult, ValidationResult } from "./types";
import { toAgentResult } from "./contract";

export type ValidatorKind = "dotnet_build" | "dotnet_test" | "review" | "command";

export async function runValidator(opts: {
  kind: ValidatorKind;
  cwd: string;
  argv?: string[];
  onLog?: (chunk: string) => void;
  /** For review validator — optional LLM summary already produced */
  reviewSummary?: string;
  reviewPassed?: boolean;
}): Promise<{ validation: ValidationResult; result: AgentResult }> {
  if (opts.kind === "review") {
    const passed = opts.reviewPassed !== false;
    const validation: ValidationResult = {
      passed,
      summary: opts.reviewSummary || (passed ? "Review validation passed" : "Review validation failed"),
      issues: passed ? [] : [opts.reviewSummary || "Review found issues"],
      artifacts: [],
    };
    return {
      validation,
      result: validationToAgentResult(validation),
    };
  }

  const argv =
    opts.argv ||
    (opts.kind === "dotnet_build"
      ? ["dotnet", "build", "-v", "q"]
      : opts.kind === "dotnet_test"
        ? ["dotnet", "test", "--no-restore", "-v", "q"]
        : null);
  if (!argv?.length) {
    const validation: ValidationResult = {
      passed: false,
      summary: "Validator missing argv",
      issues: ["missing argv"],
      artifacts: [],
    };
    return { validation, result: validationToAgentResult(validation) };
  }

  const { ok, log } = await runArgv(argv, opts.cwd, opts.onLog);
  const issues = ok
    ? []
    : log
        .split("\n")
        .filter((l) => /error|fail/i.test(l))
        .slice(0, 40);
  const validation: ValidationResult = {
    passed: ok,
    summary: ok
      ? `Validator ok: ${argv.join(" ")}`
      : `Validator failed: ${argv.join(" ")}`,
    issues: ok ? [] : issues.length ? issues : [log.slice(-500) || "non-zero exit"],
    artifacts: [],
  };
  return { validation, result: validationToAgentResult(validation, log) };
}

function validationToAgentResult(v: ValidationResult, log?: string): AgentResult {
  return toAgentResult({
    ok: v.passed,
    summary: v.summary,
    log,
    error: v.passed ? undefined : v.issues.join("\n"),
    metadata: {
      validation: true,
      issues: v.issues,
      artifacts: v.artifacts,
    },
  });
}

function runArgv(
  argv: string[],
  cwd: string,
  onLog?: (chunk: string) => void,
): Promise<{ ok: boolean; log: string }> {
  const [cmd, ...args] = argv;
  return new Promise((resolve) => {
    const child = spawn(cmd!, args, {
      cwd,
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
      append(err.message);
      resolve({ ok: false, log });
    });
    child.on("close", (code) => resolve({ ok: code === 0, log }));
  });
}
