import fs from "fs";
import path from "path";
import { getTicket, listRunsForTicket } from "./board";
import { sumTicketCostUsd } from "./cost";
import { getAgent } from "./agents";
import { getWorkstream } from "./workstreams";
import { listActionRequests } from "./human/actions";
import { listAlerts } from "./human/alerts";
import { listWorkflowEvents, appendWorkflowEvent } from "./workflow/events";
import { stagesToGraph } from "./workflow/graph";
import { ARCHIVE_DIR, ARCHIVE_INDEX_PATH, ARTIFACTS_DIR, ensureDirs } from "./paths";
import type { ArchiveIndexEntry, ArchiveManifest } from "./human/types";
import type { TicketRow, RunRow } from "./types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Archive/YYYY/MM/DD/<ticketId>/ */
export function archiveDirForDate(ticketId: string, when = new Date()): string {
  const y = when.getFullYear();
  const m = pad(when.getMonth() + 1);
  const d = pad(when.getDate());
  return path.join(ARCHIVE_DIR, String(y), m, d, ticketId);
}

function copyFileSafe(src: string, dest: string) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function copyDirRecursive(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDirRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

function readIndex(): ArchiveIndexEntry[] {
  ensureDirs();
  if (!fs.existsSync(ARCHIVE_INDEX_PATH)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(ARCHIVE_INDEX_PATH, "utf8"));
    return Array.isArray(raw) ? (raw as ArchiveIndexEntry[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: ArchiveIndexEntry[]) {
  ensureDirs();
  fs.writeFileSync(ARCHIVE_INDEX_PATH, JSON.stringify(entries, null, 2), "utf8");
}

export function listArchiveIndex(): ArchiveIndexEntry[] {
  return readIndex().sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}

export type ArchiveSearchQuery = {
  q?: string;
  agent?: string;
  workstream?: string;
  repo?: string;
  branch?: string;
  label?: string;
  model?: string;
  runtime?: string;
  outcome?: string;
  minCost?: number;
  requiredHumanApproval?: boolean;
  from?: string; // ISO date
  to?: string;
};

export function searchArchives(query: ArchiveSearchQuery): ArchiveIndexEntry[] {
  let list = listArchiveIndex();
  const q = query.q?.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (e) =>
        e.ticketId.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q) ||
        (e.workstreamId || "").toLowerCase().includes(q) ||
        (e.branch || "").toLowerCase().includes(q) ||
        e.agents.some((a) => a.toLowerCase().includes(q)),
    );
  }
  if (query.agent) {
    const a = query.agent.toLowerCase();
    list = list.filter((e) => e.agents.some((x) => x.toLowerCase() === a));
  }
  if (query.workstream) {
    const w = query.workstream.toLowerCase();
    list = list.filter(
      (e) =>
        (e.workstreamId || "").toLowerCase() === w ||
        (e.workstreamName || "").toLowerCase() === w,
    );
  }
  if (query.repo) {
    const r = query.repo.toLowerCase();
    list = list.filter((e) => (e.repoPath || "").toLowerCase().includes(r));
  }
  if (query.branch) {
    const b = query.branch.toLowerCase();
    list = list.filter((e) => (e.branch || "").toLowerCase().includes(b));
  }
  if (query.label) {
    const l = query.label.toLowerCase();
    list = list.filter((e) => e.labels.some((x) => x.toLowerCase() === l));
  }
  if (query.model) {
    const m = query.model.toLowerCase();
    list = list.filter((e) => e.models.some((x) => x.toLowerCase().includes(m)));
  }
  if (query.runtime) {
    const r = query.runtime.toLowerCase();
    list = list.filter((e) => e.runtimes.some((x) => x.toLowerCase() === r));
  }
  if (query.outcome) {
    list = list.filter((e) => e.outcome === query.outcome);
  }
  if (query.minCost != null && Number.isFinite(query.minCost)) {
    list = list.filter((e) => e.costUsd >= query.minCost!);
  }
  if (query.requiredHumanApproval === true) {
    list = list.filter((e) => e.requiredHumanApproval);
  }
  if (query.from) {
    list = list.filter((e) => e.archivedAt >= query.from!);
  }
  if (query.to) {
    list = list.filter((e) => e.archivedAt <= query.to!);
  }
  return list;
}

function buildSummaryMd(opts: {
  ticket: TicketRow;
  runs: RunRow[];
  wsName: string | null;
  cost: number;
  tokens: number;
  actions: ReturnType<typeof listActionRequests>;
  archivedAt: string;
  durationMs: number | null;
}): string {
  const { ticket, runs, wsName, cost, tokens, actions, archivedAt, durationMs } = opts;
  const stageAgents = runs
    .filter((r) => r.depth === 0)
    .map((r) => {
      const ag = getAgent(r.agentId);
      return `- **${ag?.name || r.agentId}** — ${r.model || ag?.runtime || "—"} (${r.status})`;
    });

  const humanLines = actions
    .filter((a) => a.status === "resolved")
    .map(
      (a) =>
        `- ${a.resolvedAt || a.createdAt} — **${a.resolution || "?"}** — ${a.title} (${a.requestedBy})`,
    );

  let labels: string[] = [];
  try {
    labels = JSON.parse(ticket.labelsJson || "[]");
  } catch {
    /* */
  }

  const flow = wsName
    ? runs
        .filter((r) => r.depth === 0)
        .map((r) => getAgent(r.agentId)?.name || r.agentId)
        .join("\n\n↓\n\n")
    : "";

  return `# Ticket ${ticket.id}

**${ticket.title}**

Completed · ${archivedAt}

---

## Summary

${ticket.title}

Status: \`${ticket.status}\`
Workstream: ${wsName || ticket.workstreamId || "—"}
Labels: ${labels.join(", ") || "—"}

---

## Workflow

${flow || "(no stage runs recorded)"}

↓

Approved / Complete

---

## Agents

${stageAgents.join("\n") || "(none)"}

---

## Human Actions

${humanLines.join("\n") || "(none)"}

---

## Cost

| Metric | Value |
|---|---|
| Estimated tokens | ${tokens} |
| Estimated cost | $${cost.toFixed(4)} |
| Duration | ${durationMs != null ? `${Math.round(durationMs / 1000)}s` : "—"} |

---

## Git

| Field | Value |
|---|---|
| Repository | ${ticket.repoPath || "—"} |
| Branch | ${ticket.branch || "—"} |
| Commit | ${ticket.headSha || "—"} |
| PR URL | ${ticket.prUrl || "—"} |

---

*Immutable archive generated by Railyard. Do not edit.*
`;
}

/**
 * Write an immutable case file for a completed ticket.
 * Refuses to overwrite an existing archive directory.
 */
export function writeTicketArchive(
  ticketId: string,
  opts?: { outcome?: ArchiveIndexEntry["outcome"] },
): ArchiveIndexEntry {
  ensureDirs();
  const ticket = getTicket(ticketId);
  if (!ticket) throw new Error("Ticket not found");

  const archivedAt = new Date().toISOString();
  const when = new Date(archivedAt);
  let dir = archiveDirForDate(ticketId, when);

  if (fs.existsSync(dir)) {
    // Collision: append time suffix — still immutable per folder
    dir = `${dir}_${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  }
  fs.mkdirSync(dir, { recursive: true });

  const runs = listRunsForTicket(ticketId);
  const ws = ticket.workstreamId ? getWorkstream(ticket.workstreamId) : null;
  const actions = listActionRequests({ ticketId, status: "all" });
  const alerts = listAlerts({ ticketId });
  const events = listWorkflowEvents(ticketId);
  const cost = sumTicketCostUsd(ticketId);
  const tokens = runs.reduce((s, r) => s + (r.estimatedTokens || 0), 0);
  const agents = [...new Set(runs.map((r) => r.agentId))];
  const models = [
    ...new Set(runs.map((r) => r.model).filter((m): m is string => Boolean(m))),
  ];
  const runtimes = [
    ...new Set(
      agents
        .map((id) => getAgent(id)?.runtime)
        .filter((r): r is NonNullable<typeof r> => Boolean(r))
        .map(String),
    ),
  ];
  let labels: string[] = [];
  try {
    labels = JSON.parse(ticket.labelsJson || "[]");
  } catch {
    /* */
  }

  const started = runs.map((r) => r.startedAt).sort()[0] || ticket.createdAt;
  const ended =
    runs.map((r) => r.endedAt).filter(Boolean).sort().reverse()[0] || archivedAt;
  const durationMs =
    started && ended ? new Date(ended).getTime() - new Date(started).getTime() : null;

  const humanApprovals = actions.filter(
    (a) => a.status === "resolved" && a.resolution === "approve",
  );
  const requiredHumanApproval =
    actions.some((a) => a.type === "approval") || ticket.status === "complete";

  const relativePath = path.relative(ARCHIVE_DIR, dir);
  const indexEntry: ArchiveIndexEntry = {
    ticketId,
    title: ticket.title,
    archivedAt,
    archivePath: relativePath,
    workstreamId: ticket.workstreamId,
    workstreamName: ws?.name || null,
    outcome: opts?.outcome || "complete",
    repoPath: ticket.repoPath,
    branch: ticket.branch,
    prUrl: ticket.prUrl,
    labels,
    agents,
    models,
    runtimes,
    costUsd: cost,
    estimatedTokens: tokens,
    humanApprover: humanApprovals[0]?.requestedBy || "operator",
    humanActionCount: actions.filter((a) => a.status === "resolved").length,
    requiredHumanApproval,
    durationMs,
  };

  // Files
  const summary = buildSummaryMd({
    ticket,
    runs,
    wsName: ws?.name || null,
    cost,
    tokens,
    actions,
    archivedAt,
    durationMs,
  });
  fs.writeFileSync(path.join(dir, "summary.md"), summary, "utf8");

  // ticket.md
  if (ticket.filePath && fs.existsSync(ticket.filePath)) {
    copyFileSafe(ticket.filePath, path.join(dir, "ticket.md"));
  }

  // timeline + events
  fs.writeFileSync(
    path.join(dir, "timeline.json"),
    JSON.stringify({ events, runs, actions, alerts }, null, 2),
    "utf8",
  );

  // workflow graph snapshot
  const graph = ws ? stagesToGraph(ws) : null;
  fs.writeFileSync(
    path.join(dir, "workflow.json"),
    JSON.stringify(
      {
        workstreamId: ticket.workstreamId,
        workstream: ws
          ? {
              id: ws.id,
              name: ws.name,
              stages: ws.stages,
              completeAction: ws.completeAction,
            }
          : null,
        graph,
        currentNodeId: ticket.currentNodeId,
      },
      null,
      2,
    ),
    "utf8",
  );

  // logs / prompts hashes
  const logsDir = path.join(dir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  for (const run of runs) {
    const safe = run.id.slice(0, 8);
    fs.writeFileSync(
      path.join(logsDir, `${safe}-${run.agentId}.log`),
      run.log || "",
      "utf8",
    );
  }
  fs.writeFileSync(
    path.join(dir, "prompts"),
    // directory of prompt hashes (full prompts not retained for privacy)
    "",
    "utf8",
  );
  // Fix: prompts should be a directory
  fs.unlinkSync(path.join(dir, "prompts"));
  const promptsDir = path.join(dir, "prompts");
  fs.mkdirSync(promptsDir, { recursive: true });
  for (const run of runs) {
    fs.writeFileSync(
      path.join(promptsDir, `${run.id.slice(0, 8)}.json`),
      JSON.stringify(
        {
          runId: run.id,
          agentId: run.agentId,
          model: run.model,
          promptHash: run.promptHash,
          task: run.task,
          summary: run.summary,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  // artifacts + diffs
  const artSrc = path.join(ARTIFACTS_DIR, ticketId);
  copyDirRecursive(artSrc, path.join(dir, "artifacts"));
  const dataDiffs = path.join(path.dirname(ARTIFACTS_DIR), "diffs", ticketId);
  if (fs.existsSync(dataDiffs)) {
    copyDirRecursive(dataDiffs, path.join(dir, "diffs"));
  } else {
    fs.mkdirSync(path.join(dir, "diffs"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "diffs", "changed-files.json"),
      ticket.changedFilesJson || "[]",
      "utf8",
    );
  }

  const files = walkRel(dir, dir);
  const manifest: ArchiveManifest = {
    version: 1,
    ticketId,
    archivedAt,
    immutable: true,
    index: indexEntry,
    files,
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  // Update searchable index (replace prior entry for same ticket)
  const idx = readIndex().filter((e) => e.ticketId !== ticketId);
  idx.push(indexEntry);
  writeIndex(idx);

  appendWorkflowEvent(ticketId, "TicketArchived", {
    archivePath: relativePath,
    costUsd: cost,
  });

  return indexEntry;
}

function walkRel(root: string, dir: string): string[] {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkRel(root, full));
    else out.push(path.relative(root, full));
  }
  return out.sort();
}

export function readArchiveSummary(archivePath: string): string | null {
  const full = path.isAbsolute(archivePath)
    ? archivePath
    : path.join(ARCHIVE_DIR, archivePath);
  const summary = path.join(full, "summary.md");
  if (!fs.existsSync(summary)) return null;
  return fs.readFileSync(summary, "utf8");
}
