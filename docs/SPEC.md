# Railyard — Full Product & Technical Specification

**Version:** as of 2026-07-18  
**Repository:** `/Users/user/Documents/Railyard`  
**Audience:** operators, contributors, external model review (product + architecture + behaviour)

## Maintenance (required)

This file is the **canonical** description of what Railyard is and does. Keep it accurate.

| When you change… | Update in SPEC… |
|---|---|
| Board / review / routing / spawn behaviour | §§ 6–9, 19–20 |
| Settings or budgets | § 18 |
| APIs or pages | §§ 5, 17 |
| Harnesses / connectors / jobs | §§ 6.6, 12–14 |
| Security controls | § 15 |
| Explicit stubs / non-goals | § 21 |
| New workstreams or agents that change product story | §§ 6.3–6.4 |

Also bump the **Version** date at the top when you edit this file.  
Cross-link detail docs (`ROUTING`, `SUB_AGENTS`, `SECURITY`, `JOB_STREAMS`, `ROADMAP`) rather than duplicating long protocols.

---

## 1. One-sentence definition

**Railyard is a local-only agent fleet control plane:** a kanban board where *tickets* own intent, *workstreams* define policy (stages, routing, git, complete actions), and *agents* are swappable workers executed by pluggable harnesses (OpenCode, demo, Cursor stub, shell commands) under human approve gates, budgets, and spawn limits.

---

## 2. Positioning

### What it is

- A **dispatch / orchestration UI + server** that runs on the operator’s machine.
- A **policy layer** over coding agents: pipelines, failure/success jumps, sub-agent gates, cost ceilings, review-before-PR.
- A **local integration hub** for git worktrees, optional `gh pr create`, Azure DevOps import/write-back, cron-like job streams, and a read-only MCP-ish status API.

### What it is not

- Not a code editor (does not compete with Cursor/VS Code/Rider as an IDE).
- Not a multi-tenant SaaS or hosted agent cloud.
- Not an auth-protected multi-user product (by design: no login).
- Not a replacement for OpenCode’s agent loop (OpenCode remains the primary real LLM harness).
- Not a full OS sandbox / container runtime (command stages use host `dotnet` on PATH; Docker/devcontainer is explicitly deferred).

### Closest peers

Tools like Vibe Kanban, Conductor, Emdash emphasize parallel runners and review UX. Railyard’s intended differentiation:

| Differentiator | Behaviour |
|---|---|
| Workstreams | Named pipelines/jobs with stages + policies |
| Gated sub-agents | Spawn→resume with hard caps |
| .NET-native verify | Non-LLM `command` stages (`dotnet test`, etc.) |
| Review-first Complete | Human Approve / Request changes / Reject before prune/PR |
| Stage routing | Configurable onSuccess / onFailure / request-changes targets |
| Jobs | `kind: job` cron tick + single-runner queue |

---

## 3. Design principles (locked)

1. **Local-only** — bind `127.0.0.1`; no authentication; see Security.
2. **Tickets own intent** — work is markdown ticket files + board state, not chat threads alone.
3. **Agents are workers** — prompts live in `agents/*.md`; reusable across workstreams.
4. **You own policy** — workstreams, budgets, spawn gates, approve gates, routing.
5. **Harnesses are swappable** — registry: `demo` | `opencode` | `cursor` | `command`.
6. **Approve before irreversible git/PR** — pipeline ends in Review (`pending_review`), not silent auto-PR.
7. **Never store secrets in the vault/docs** — secrets live in local gitignored JSON (`data/providers.json`, `data/connectors.json`).

---

## 4. Tech stack

| Layer | Choice |
|---|---|
| UI | Next.js 15 (App Router), React 19, Tailwind 4 |
| DnD board | `@dnd-kit` |
| Markdown | `gray-matter`, `react-markdown`, remark-gfm |
| Validation | Zod (`boardSettingsSchema`, URL/repo guards) |
| Persistence | JSON file store `data/store.json` (not SQLite in current build) |
| Agent harness (real) | Local CLI `opencode run` with JSON stream |
| Language | TypeScript |

**Scripts**

- `npm run dev` → `next dev --hostname 127.0.0.1`
- `npm run start` → `next start --hostname 127.0.0.1`
- `npm run db:seed` → `tsx scripts/seed.ts`
- `npm run build` → `next build`

**Default URL:** `http://127.0.0.1:3000`

---

## 5. User surfaces (pages)

| Route | Purpose |
|---|---|
| `/` | **Board** — workstream viewport, kanban columns, ticket cards, drawer |
| `/agents` | Agent library CRUD (markdown prompts under `agents/`) |
| `/workstreams` | Pipeline/job templates: stages, git, complete action, routing |
| `/jobs` | Job stream queue + **Tick now** |
| `/settings` | Board settings, providers, connectors (tabs; `/providers` & `/connectors` redirect) |

**Shell nav:** Board · Agents · Workstreams · Jobs · Settings

---

## 6. Core domain concepts

### 6.1 Ticket

A unit of work.

- **File:** `tickets/<id>.md` (frontmatter + body).
- **Board row:** stored in `data/store.json` (`tickets[]`).
- **Statuses:** `inbox` | `queued` | `running` | `needs_human` | `pending_review` | `complete`.
- **Key fields:** title, labels, `workstreamId`, branch, worktree paths, repo/base/head, PR URL, failure reason, changed files JSON, prevent-auto-advance flag, optional external/ADO id.

### 6.2 Column

Board columns:

| Kind | Role |
|---|---|
| `inbox` | Intake |
| `agent` | One stage of a workstream (agent or command stage) |
| `needs_human` | Manual intervention / hard stop |
| `complete` | UI title **Review** — holds `pending_review` and finished tickets |

Agent columns are scoped by `workstreamId` (`col-ws-<stream>-<stageKey>`). The board viewport shows system columns + stages of the **active workstream**.

### 6.3 Agent (library)

Markdown under `agents/*.md`:

```yaml
id, name, runtime, model, autonomous, color, canSpawn?
```

Body = system/prompt text. Shared across workstreams. Default library includes: planner, implementer, reviewer, triage, reproduce, fix, verify, scope, spike, writeup (and similar).

### 6.4 Workstream

Markdown under `workstreams/*.md`:

| Field | Meaning |
|---|---|
| `kind` | `pipeline` (kanban stages) or `job` (cron/single-runner) |
| `stages` | Ordered list of agent ids and/or command stage objects |
| `git` | Whether to use per-ticket worktrees |
| `completeAction` | `commit_and_pr` \| `note_only` \| `connector_reply` |
| `defaultLabels` | Applied on create |
| `trigger` | Jobs: e.g. `{ type: cron, expression: "*/30 * * * *" }` |
| `onRequestChanges` | Agent id for human Request changes |
| `defaultOnFailure` | Fallback failure route agent id |
| Per-stage `onFailure` / `onSuccess` | See Routing |

**Shipped workstreams**

| Id | Kind | Notes |
|---|---|---|
| `feature` | pipeline | planner → implementer → reviewer; fail→planner; success→review |
| `bug` | pipeline | triage → reproduce → fix → verify; fail→triage |
| `dotnet-feature` | pipeline | planner → implementer → `dotnet test` command → reviewer |
| `research` | pipeline | stages empty / note_only oriented |
| `demo-job` | job | cron demo with writeup runner |

### 6.5 Run

One harness invocation (stage or sub-agent).

Stored fields include: status, log, parent/depth/task (spawn tree), model, estimated tokens/cost, events timeline JSON, summary, prompt hash (audit; no secret env).

### 6.6 Runtime / harness

| Kind | Behaviour |
|---|---|
| `demo` | Simulated work; no API keys; can demo-spawn |
| `opencode` | Spawns local `opencode run` with JSON + thinking stream |
| `cursor` | Checks provider key; detects `@cursor/sdk` if present; otherwise keyed demo stub (SDK stream not fully wired) |
| `command` | Runs argv in worktree cwd (exit code = success/fail) |

Registry: `src/lib/runtimes/registry.ts`. Settings `demoMode` forces demo for agent runs.

---

## 7. Board behaviour

### 7.1 Creating tickets

- Local create via board/API → Inbox.
- Import via `POST /api/import` with `items[]` or `{ "action": "ado" }`.
- Job tick creates `[job] …` tickets when cron due.

### 7.2 Dragging / scheduling

- Drag onto an **agent** column → `queued`, then `scheduleColumn` / `runAgentOnTicket`.
- Drag onto **Review/Complete** without approve → parks as `pending_review` (review-first).
- **Auto-advance** (setting): after successful stage, route via onSuccess / next / Review.
- **Prevent auto-advance** per ticket (hold).
- **Parallel runs** off: one running ticket globally. On: one running ticket **per worktree/repo**, plus `.railyard-lock` advisory file.

### 7.3 Stage execution (happy path)

1. Resolve workstream + stage (agent or command).
2. If `git`: ensure worktree under `.worktrees/<ticketId>`, set branch, lock.
3. Budget check (hard-stop if enabled and exceeded).
4. Run agent (with spawn loops) or command argv.
5. Persist run log/cost/events/summary/promptHash.
6. On failure → route via onFailure / defaultOnFailure / Needs human.
7. On `railyard-rework` fence → treat as soft failure route.
8. On success → note on ticket; honor `railyard-advance` fence or stage `onSuccess`; else linear next; end → `pending_review`.

### 7.4 Review gate (human)

From drawer or card when `pending_review`:

| Action | Effect |
|---|---|
| **Approve & finish** | `completeTicket({ approved: true })` — commit/prune/PR/ADO per policy |
| **Request changes** | Route to `onRequestChanges` (or defaultOnFailure / last stage) |
| **Reject** | Needs human with reason |

### 7.5 Complete (approve only)

When approved and workstream `completeAction === commit_and_pr` and `git`:

1. Commit in worktree.
2. Capture completion diff / changed files (artifacts under `data/artifacts/<ticketId>/`).
3. Attempt `gh pr create` if not demo mode (soft-fail if `gh` missing).
4. Prune worktree.
5. Optional ADO write-back comment.
6. Status → `complete`.

`note_only` / `connector_reply` skip or stub the git/PR path.

---

## 8. Stage routing (success & failure)

Full detail: `docs/ROUTING.md`.

### Priority (highest first)

1. Agent fence for this run (`railyard-rework` / `railyard-advance`)
2. Per-stage `onFailure` / `onSuccess`
3. Workstream `defaultOnFailure` / `onRequestChanges`
4. Defaults: failure → Needs human; success → next stage; last → Review

### onSuccess values

`next` | `review` | `needs_human` | `<agentId>`

### onFailure / request-changes

`<agentId>` or Needs human.

### Example (feature stream)

- Reviewer finds issues → `railyard-rework` or hard fail → **planner**.
- Human Request changes → **planner**.
- Reviewer DONE → **Review** column (`onSuccess: review`), not auto-PR.

---

## 9. Sub-agents

Full detail: `docs/SUB_AGENTS.md`.

- Only agents with `canSpawn: true` may emit spawn blocks (default: planner, triage, scope).
- Protocol: fenced `railyard-spawn` JSON array of `{ agentId, task }`.
- Orchestrator: spawn → run children → resume parent with results; repeat up to `maxSpawnRounds`.
- Hard caps in Settings (depth, per round, per stage, parallel siblings, master switch).
- Rejects: unknown id, self-spawn, duplicate agent in block, over budget; logged `[spawn-gate]`.
- UI: run tree in ticket drawer.

Prompts wrap ticket/sub-agent content as untrusted delimiters (`<<<UNTRUSTED_*>>>`).

---

## 10. Cost & budgets

- Per run: `estimatedTokens` (OpenCode usage events when present, else heuristic from prompt+log length), `estimatedCostUsd` (default ~$0.002 / 1k tokens).
- Settings: `budgetPerTicketUsd` (default 5), `budgetPerDayUsd` (default 25), `budgetHardStop` (default true).
- Hard-stop checked **before** launching a new run; failed budget runs are recorded.
- UI: cost chip on cards; day total in board header; ticket cost in drawer.

---

## 11. Git & worktrees

- Settings: `repoPath` (must be under `~/Documents` or `$HOME` and contain `.git`), `baseRef`, `worktreeRoot` (`.worktrees`), `branchPrefix` (`agent/`).
- Demo: can use sandbox repo under `data/sandbox-repo/` when no repo configured (seed/scripts).
- Per ticket: branch + worktree path; on complete may set `lastWorktreePath` after prune.
- Advisory lock: `.worktrees/<id>/.railyard-lock` (ticketId, pid, timestamp); stale PID best-effort clear.
- Diff API: ticket drawer “Paths & diff” via `/api/tickets/[id]/diff`.

---

## 12. Providers & connectors

### Providers (`data/providers.json`, gitignored)

Kinds: cursor, opencode, copilot, deepseek, openai_compatible.  
Store API keys locally; UI shows masked keys. Used for Cursor runtime and model listing.

### Connectors (`data/connectors.json`, gitignored)

Built-ins: ADO, Trello, GitHub, Linear (stubs/config).  

**ADO (implemented path):**

- Import: `POST /api/import` `{ "action": "ado" }` — WIQL when connector enabled + PAT; else demo item.
- Labels can carry `workstream:…` for assignment.
- Write-back: on Approve, comment/history patch when enabled (demo stub otherwise).
- Setting `requireApproveForImportedTickets` (default true).

**GitHub PR:**

- On Approve (non-demo): local `gh pr create` (soft-fail if missing).

Outbound URL hardening blocks private/metadata hosts unless `RAILYARD_ALLOW_LOCAL_FETCH=1`.

---

## 13. Jobs

Full detail: `docs/JOB_STREAMS.md`.

- Workstream `kind: job` + `trigger.type: cron` (supports `*/N * * * *` step minutes and `*`).
- `POST /api/jobs/tick` or Jobs UI **Tick now**.
- Single-runner: skips if a ticket for that stream is already queued/running.
- Creates ticket, moves to first agent stage, runs agent.
- `completeAction: connector_reply` is stubbed for reply/send.

---

## 14. Portable policy / MCP

| Endpoint | Behaviour |
|---|---|
| `GET/POST /api/agents-md` | Emit/write `AGENTS.md` from agent library + workstreams |
| `GET/POST /api/mcp` | Read-only “MCP-ish” tools: `board_status`, `list_tickets`, `agents_md` |

Intended for Cursor/other clients to observe board state — **not** a full MCP protocol server with auth.

---

## 15. Security model

Full detail: `docs/SECURITY.md`.

| Control | Behaviour |
|---|---|
| Bind | 127.0.0.1 only |
| Auth | None — do not expose beyond loopback |
| Settings | Zod ceilings; safe repoPath |
| IDs | slug-only; path containment |
| Provider/connector URLs | SSRF-ish blocks |
| Agent child env | Minimal (not full process.env) |
| Prompts | Untrusted delimiters for ticket/subagent text |
| Logs | Basic secret redaction |
| Import | Size/count caps |

**Not provided:** OS sandbox for agent tools inside worktree; network isolation for OpenCode `--auto`.

---

## 16. Data layout on disk

```
Railyard/
  agents/*.md              # agent prompts
  workstreams/*.md         # pipelines / jobs
  tickets/*.md             # ticket markdown
  data/
    store.json             # settings, columns, tickets, runs, job_state
    providers.json         # secrets (gitignored)
    connectors.json        # secrets (gitignored)
    artifacts/<ticketId>/  # diff artifacts
    sandbox-repo/          # optional demo git repo
  .worktrees/<ticketId>/   # per-ticket worktrees (+ .railyard-lock)
  docs/                    # SECURITY, ROUTING, SUB_AGENTS, JOB_STREAMS, ROADMAP
  src/lib/                 # orchestrator, board, runtimes, …
  src/app/                 # Next pages + API routes
```

---

## 17. HTTP API map (local)

| Method | Path | Role |
|---|---|---|
| GET | `/api/board` | Settings, visible columns, tickets, agents, workstreams, dayCost, ticketCosts |
| PATCH/POST | `/api/tickets` | create, move, resume/retry, schedule, update, delete, **approve**, **requestChanges**, **reject** |
| GET/PUT | `/api/tickets/[id]` | Detail (ticket, markdown, runs, cost) |
| GET | `/api/tickets/[id]/diff` | Paths & file diffs |
| GET/POST | `/api/agents` | Agent library |
| GET/POST | `/api/workstreams` | CRUD + activate |
| GET/POST | `/api/columns` | Column ops |
| GET/POST | `/api/settings` | Board settings |
| GET/POST | `/api/providers` | Providers |
| GET | `/api/providers/models` | Model list for provider |
| GET/POST | `/api/connectors` | Connectors |
| POST | `/api/import` | items[] or action=ado |
| GET/POST | `/api/jobs`, `/api/jobs/tick` | Job queue + cron tick |
| GET/POST | `/api/agents-md` | AGENTS.md |
| GET/POST | `/api/mcp` | Read-only board tools |

---

## 18. Key settings (`BoardSettings`)

| Setting | Default (conceptually) | Role |
|---|---|---|
| `repoPath`, `baseRef` | "", `main` | Git target |
| `autoAdvance` | true | Advance/route after success |
| `parallelRuns` | false | Parallel scheduling mode |
| `worktreeRoot`, `branchPrefix` | `.worktrees`, `agent/` | Worktree layout |
| `defaultRuntime`, `defaultModel` | cursor / composer… | Defaults |
| `autonomous` | true | YOLO-style agent flag AND’d with agent.autonomous |
| `demoMode` | true | Force demo harness |
| `activeWorkstreamId` | `feature` | Board viewport |
| Sub-agent caps | depth 1, rounds 2, etc. | Spawn gates |
| `budgetPerTicketUsd` / `budgetPerDayUsd` | 5 / 25 | Spend ceilings |
| `budgetHardStop` | true | Refuse runs when over |
| `ado*` / `adoWriteBack` | | Legacy ADO fields + write-back |
| `requireApproveForImportedTickets` | true | Trust ladder |

---

## 19. Orchestrator module map

Primary file: `src/lib/orchestrator.ts`

| Function | Role |
|---|---|
| `runAgentOnTicket` | Execute current stage |
| `runStageWithSpawns` | Spawn→resume loops |
| `autoAdvance` | Linear next / park Review |
| `routeOnSuccess` | onSuccess / advance fence |
| `routeTicketAfterFailure` | onFailure / rework / request-changes |
| `parkForReview` | `pending_review` |
| `approveTicket` / `requestChangesTicket` / `rejectTicket` | Review actions |
| `completeTicket` | Approved finish (git/PR/ADO) |
| `scheduleBoard` / `scheduleColumn` | Queue runners |
| `getTicketDetail` | Drawer payload |

Supporting libs: `board`, `workstreams`, `spawn`, `rework`, `cost`, `git`, `worktree-lock`, `github-pr`, `ado`, `jobs`, `security`, `runtimes/*`.

---

## 20. UI feature checklist (Board)

- Workstream switcher
- Demo import / Run queue
- DnD columns and cards
- Status pills including `pending_review`
- Cost chips + day spend
- Card actions: Approve / Changes / Reject; Resume / Retry
- Drawer: preview/edit markdown, paths & diff, live run log, run timeline, cost, failure reason, review actions, prevent auto-advance, delete

---

## 21. Explicit limitations & known stubs

1. **No auth** — loopback only.
2. **Cursor Agent SDK** — structured stub + optional package detect; not full streaming Agent.create.
3. **Copilot runtime** — placeholder → demo.
4. **connector_reply** — stub notes only.
5. **Trello/Linear/GitHub issue import** — connector shells; ADO import/write-back is the real path.
6. **Cron** — minimal matcher (`*/N` and `*`); requires external or manual tick (no always-on daemon beyond Next process).
7. **MCP** — HTTP stub, not a standards-complete MCP server.
8. **No Docker sandbox** for command stages.
9. **Budget costs** are estimates, not provider invoices.
10. **Parallelism** is best-effort (locks + one-per-worktree), not a distributed fleet.
11. **Tests** — no large automated orchestrator E2E suite claimed; `tsc --noEmit` used as type gate.

---

## 22. Mental model for reviewers

```
Spec (ticket markdown)
    ↓
Plan (workstream stages + routing policy)
    ↓
Run (harness: OpenCode / demo / command / Cursor stub)
    ├─ optional gated sub-agents
    ├─ cost accounting + hard-stop
    └─ success/failure/fence routing
    ↓
Review (human: approve / request changes / reject)
    ↓
Close the loop (commit, prune, gh PR, ADO write-back)
```

**Operator owns:** which agents, which stages, where failures go, spend limits, when PR is allowed.  
**Agents own:** work inside the worktree (and tools their harness permits).  
**Railyard owns:** queueing, policy enforcement, audit logs/runs, and the human gate.

---

## 23. Suggested review questions for GPT

1. Is review-first + routing enough to prevent silent bad PRs on real repos?
2. Are spawn/budget gates sufficient against runaway cost/fan-out?
3. Is local-only + no-auth the right trust model, or should there be optional token auth even on loopback?
4. Should command stages (dotnet) move to containers before production use?
5. Is the workstream YAML + UI the right policy UX vs a visual graph?
6. Does differentiating vs Cursor-as-editor / peer kanbans hold?
7. What is the minimum E2E test matrix before trusting non-demo mode?
8. How should Cursor SDK streaming replace the stub without breaking the `onLog`/`events` contract?

---

## 24. Related in-repo docs

| Doc | Topic |
|---|---|
| `README.md` | Quick start |
| `docs/ROADMAP.md` | Phased shipped scope |
| `docs/ROUTING.md` | onSuccess / onFailure / fences |
| `docs/SUB_AGENTS.md` | Spawn protocol + caps |
| `docs/JOB_STREAMS.md` | Jobs |
| `docs/SECURITY.md` | Hardening |
| This file | Full spec for external review |

---

*End of specification.*
