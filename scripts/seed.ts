import { resetDbFile, saveSettings, getSettings } from "../src/lib/db";
import {
  ensureBaseColumns,
  insertTicket,
  listColumns,
  syncWorkstreamColumns,
} from "../src/lib/board";
import { createLocalTicketId, writeTicketMarkdown, updateTicketMarkdown } from "../src/lib/tickets-fs";
import { listWorkstreams } from "../src/lib/workstreams";
import { ensureDirs } from "../src/lib/paths";

ensureDirs();
resetDbFile();
ensureBaseColumns();

const settings = getSettings();
saveSettings({
  ...settings,
  demoMode: true,
  autoAdvance: true,
  parallelRuns: false,
  autonomous: true,
  adoOrg: "contoso",
  adoProject: "Platform",
  adoWriteBack: true,
  activeWorkstreamId: "feature",
});

const streams = listWorkstreams();
for (const ws of streams) {
  syncWorkstreamColumns(ws.id);
}

const inbox = listColumns().find((c) => c.kind === "inbox")!;

const samples = [
  {
    adoId: "1042",
    title: "Fix auth token expiry on mobile refresh",
    commentCount: 3,
    labels: ["bug", "mobile"],
    workstreamId: "bug",
    body: `## Description

Tokens expire while the app is backgrounded; users get bounced to login.

## Acceptance Criteria

- Silent refresh succeeds when refresh token is valid
- Expired refresh token still routes to login
- No secrets in logs
`,
  },
  {
    adoId: "1108",
    title: "Add welfare check reminder for long shifts",
    commentCount: 0,
    labels: ["feature"],
    workstreamId: "feature",
    body: `## Description

Dispatchers need a nudge when a rider has been on shift too long without a welfare ping.

## Acceptance Criteria

- Configurable threshold in settings
- Notification to dispatch roles only
`,
  },
  {
    adoId: "1120",
    title: "Spike: offline temperature sync approaches",
    commentCount: 1,
    labels: ["research"],
    workstreamId: "research",
    body: `## Description

Compare approaches for offline temperature reading sync before committing to a design.

## Acceptance Criteria

- Short writeup with recommendation
- No production PR required
`,
  },
];

for (const s of samples) {
  const id = createLocalTicketId();
  const filePath = writeTicketMarkdown({
    id,
    title: s.title,
    adoId: s.adoId,
    body: s.body,
    labels: s.labels,
    commentCount: s.commentCount,
  });
  updateTicketMarkdown(filePath, { workstreamId: s.workstreamId });
  insertTicket({
    id,
    adoId: s.adoId,
    title: s.title,
    filePath,
    columnId: inbox.id,
    status: "inbox",
    preventAutoAdvance: false,
    commentCount: s.commentCount,
    workstreamId: s.workstreamId,
    branch: null,
    worktreePath: null,
    lastWorktreePath: null,
    repoPath: null,
    baseRef: null,
    headSha: null,
    prUrl: null,
    failureReason: null,
    changedFilesJson: "[]",
    labelsJson: JSON.stringify(s.labels),
    currentNodeId: null,
  });
}

console.log(
  "Seeded Railyard with",
  samples.length,
  "tickets across",
  streams.length,
  "workstreams:",
  streams.map((w) => w.id).join(", "),
);
