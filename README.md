# Railyard

Local-only **agent fleet control plane**: workflow graphs, human inbox (actions + alerts), immutable archives, review-first Complete, validators, and swappable harnesses.

## Run it

```bash
cd /Users/user/Documents/Railyard
npm install
npm run db:seed
npm run dev
```

Open **http://127.0.0.1:3000** (loopback only — see `docs/SECURITY.md`).

## Try this

1. **Settings → Boards** — create a board per repo (e.g. BloodBike Web vs MAUI); set absolute `repoPath` and which workstreams it uses.
2. **Board** dropdown on the kanban — switch workspace first, then **Workstream** within that board.
3. Drag a ticket through agent stages — demo/runtime runs and auto-advances within the stream (tickets stay on their board).
4. Pipeline ends in **Review** (`pending_review`), not auto-PR. Use **Approve & finish**, **Request changes**, or **Reject**.
5. Configure **onFailure / onSuccess** per stage (and Request-changes → planner) under Workstreams — see `docs/ROUTING.md` and `docs/WORKFLOW.md`.
6. Watch **day $** in the board header and cost chips on cards (Settings → Runtime → budgets + hard-stop).
7. **Workstreams** — edit stages; badges show which boards use each stream; add **+ dotnet verify** command gates; create `kind: job` streams with cron.
8. **Jobs** — tick cron job streams (`POST /api/jobs/tick`).
9. **Settings** — Boards, Runtime, providers, connectors. ADO import: `POST /api/import` `{ "action": "ado" }`.
10. **Workflow tests** — `npm test` (graph routing, validators, budget/spawn gates, event replay).

## Layout

| Path | Role |
|---|---|
| `agents/*.md` | Agent prompts (shared library) |
| `workstreams/*.md` | Pipeline / job templates (agent + command + validator stages) |
| `tickets/*.md` | Local ticket copies |
| `data/store.json` | Board state + workflow events |
| `src/lib/workflow/` | Graph engine, AgentResult, validators, events, tests |
| `src/lib/runtimes/` | Harness registry (`demo`, `opencode`, `cursor`, `command`) |
| `docs/SPEC.md` | **Full product & technical specification** (keep current) |
| `docs/WORKFLOW.md` | Graph / AgentResult / validators / events |
| `docs/ARCHIVE.md` | Human inbox, alerts, immutable archives |
| `docs/ROUTING.md` | Success/failure stage routing + agent fences |
| `docs/ROADMAP.md` | Phased control-plane roadmap |
| `docs/JOB_STREAMS.md` | Job stream design |
| `docs/SUB_AGENTS.md` | Sub-agent spawn protocol |
| `docs/SECURITY.md` | Local-only hardening |

## Spec

Canonical product/architecture write-up for operators and external review: **[`docs/SPEC.md`](docs/SPEC.md)**.  
Agents must update it when behaviour, APIs, settings, or scope change (see `AGENTS.md`).


## APIs (local)

| Endpoint | Role |
|---|---|
| `POST /api/tickets` actions `approve` / `requestChanges` / `reject` | Review gate |
| `POST /api/jobs/tick` | Cron tick for `kind: job` |
| `GET/POST /api/agents-md` | Portable AGENTS.md |
| `GET/POST /api/mcp` | Read-only board status for Cursor |
| `POST /api/import` `{ "action": "ado" }` | ADO (or demo) import |
