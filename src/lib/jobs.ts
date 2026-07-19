import { getSettings, readStore, updateStore } from "./db";
import { getWorkstream, listWorkstreams, stageColumnId } from "./workstreams";
import {
  ensureWorkstreamsReady,
  insertTicket,
  listColumns,
  listTickets,
  moveTicket,
  updateTicket,
} from "./board";
import { createLocalTicketId, updateTicketMarkdown, writeTicketMarkdown } from "./tickets-fs";

type JobState = {
  lastTickAt: string | null;
  lastFired: Record<string, string>;
};

function readJobState(): JobState {
  const store = readStore();
  return store.job_state || { lastTickAt: null, lastFired: {} };
}

function writeJobState(state: JobState) {
  updateStore((s) => {
    s.job_state = state;
  });
}

/** Very small cron matcher: supports step minutes (e.g. every N minutes) and `*` wildcards. */
export function cronDue(expression: string, lastFiredAt: string | null, now = new Date()): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5) return false;
  const [minPart] = parts;
  const nowMin = now.getMinutes();

  if (minPart === "*") {
    // every minute — throttle to once per minute via lastFired
    if (!lastFiredAt) return true;
    return now.getTime() - new Date(lastFiredAt).getTime() >= 55_000;
  }
  const step = minPart?.startsWith("*/") ? Number(minPart.slice(2)) : NaN;
  if (!Number.isFinite(step) || step <= 0) return false;
  if (nowMin % step !== 0) return false;
  if (!lastFiredAt) return true;
  return now.getTime() - new Date(lastFiredAt).getTime() >= step * 55_000;
}

export async function tickJobs(): Promise<{
  fired: string[];
  skipped: string[];
  errors: string[];
}> {
  ensureWorkstreamsReady();
  const state = readJobState();
  const now = new Date();
  const fired: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  const jobs = listWorkstreams().filter((w) => w.kind === "job");
  for (const job of jobs) {
    const trigger = job.trigger;
    if (!trigger || trigger.type !== "cron") {
      skipped.push(`${job.id}: no cron trigger`);
      continue;
    }
    const last = state.lastFired[job.id] || null;
    if (!cronDue(trigger.expression, last, now)) {
      skipped.push(`${job.id}: not due`);
      continue;
    }

    // Single-runner: skip if a job ticket already running for this stream
    const running = listTickets().some(
      (t) => t.workstreamId === job.id && (t.status === "running" || t.status === "queued"),
    );
    if (running) {
      skipped.push(`${job.id}: already queued/running`);
      continue;
    }

    try {
      const inbox = listColumns().find((c) => c.kind === "inbox");
      if (!inbox) throw new Error("No inbox");
      const id = createLocalTicketId();
      const title = `[job] ${job.name} @ ${now.toISOString()}`;
      const filePath = writeTicketMarkdown({
        id,
        title,
        adoId: null,
        body: `## Job run\n\nWorkstream: ${job.id}\nCron: ${trigger.expression}\n`,
        labels: [...job.defaultLabels, "job"],
        commentCount: 0,
      });
      updateTicketMarkdown(filePath, { workstreamId: job.id, source: "job" });
      insertTicket({
        id,
        adoId: null,
        title,
        filePath,
        columnId: inbox.id,
        status: "inbox",
        preventAutoAdvance: false,
        commentCount: 0,
        workstreamId: job.id,
        branch: null,
        worktreePath: null,
        lastWorktreePath: null,
        repoPath: null,
        baseRef: null,
        headSha: null,
        prUrl: null,
        failureReason: null,
        changedFilesJson: "[]",
        labelsJson: JSON.stringify([...job.defaultLabels, "job"]),
        currentNodeId: null,
      });

      const first = job.stages[0];
      if (first?.kind === "agent") {
        const colId = stageColumnId(job.id, first);
        moveTicket(id, colId, 0);
        updateTicket(id, { status: "queued", workstreamId: job.id });
        const { runAgentOnTicket } = await import("./orchestrator");
        void runAgentOnTicket(id).catch((err) => console.error("job run failed", err));
      }

      state.lastFired[job.id] = now.toISOString();
      fired.push(job.id);
    } catch (err) {
      errors.push(`${job.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  state.lastTickAt = now.toISOString();
  writeJobState(state);
  return { fired, skipped, errors };
}

export function listJobQueue() {
  const settings = getSettings();
  const jobs = listWorkstreams().filter((w) => w.kind === "job");
  const tickets = listTickets().filter((t) =>
    jobs.some((j) => j.id === t.workstreamId) ||
    (JSON.parse(t.labelsJson || "[]") as string[]).includes("job"),
  );
  return {
    jobs: jobs.map((j) => ({
      id: j.id,
      name: j.name,
      trigger: j.trigger,
      stages: j.stages,
    })),
    tickets,
    activeWorkstreamId: settings.activeWorkstreamId,
    state: readJobState(),
  };
}

export function getJobWorkstream(id: string) {
  const ws = getWorkstream(id);
  return ws?.kind === "job" ? ws : null;
}
