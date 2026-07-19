import { spawnSync } from "child_process";
import { agentChildEnv } from "./security";

export type PrResult = {
  ok: boolean;
  url: string | null;
  log: string;
  skipped?: boolean;
};

/** Create a GitHub PR via local `gh` CLI. Soft-fails if gh missing. */
export function createGithubPr(opts: {
  cwd: string;
  title: string;
  body: string;
  base: string;
  head: string;
}): PrResult {
  const which = spawnSync("which", ["gh"], { encoding: "utf8" });
  if (which.status !== 0) {
    return {
      ok: false,
      url: null,
      log: "gh CLI not found — skipped PR create",
      skipped: true,
    };
  }

  const args = [
    "pr",
    "create",
    "--title",
    opts.title,
    "--body",
    opts.body,
    "--base",
    opts.base,
    "--head",
    opts.head,
  ];
  const result = spawnSync("gh", args, {
    cwd: opts.cwd,
    env: agentChildEnv(),
    encoding: "utf8",
    timeout: 60_000,
  });
  const log = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status !== 0) {
    return { ok: false, url: null, log: log || `gh exited ${result.status}` };
  }
  const urlMatch = log.match(/https:\/\/github\.com\/\S+/);
  return { ok: true, url: urlMatch?.[0] || log.split("\n").pop() || null, log };
}
