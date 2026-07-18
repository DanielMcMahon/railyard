# Railyard

Local-only **agent fleet control plane**: workstreams, review-first Complete, cost budgets, command gates (e.g. `dotnet test`), and swappable harnesses (demo / OpenCode / Cursor stub / command).

## Run it

```bash
cd /Users/user/Documents/Railyard
npm install
npm run db:seed
npm run dev
```

Open **http://127.0.0.1:3000** (loopback only — see `docs/SECURITY.md`).

## Try this

1. **Workstream** dropdown — Feature, Bug, Research, or **.NET feature** (includes a `dotnet test` command stage).
2. Drag a ticket through agent stages — demo/runtime runs and auto-advances within the stream.
3. Pipeline ends in **Review** (`pending_review`), not auto-PR. Use **Approve & finish**, **Request changes**, or **Reject**.
4. Configure **onFailure / onSuccess** per stage (and Request-changes → planner) under Workstreams — see `docs/ROUTING.md`.
5. Watch **day $** in the board header and cost chips on cards (Settings → budgets + hard-stop).
6. **Workstreams** — edit stages; add **+ dotnet verify** command gates; create `kind: job` streams with cron.
7. **Jobs** — tick cron job streams (`POST /api/jobs/tick`).
8. **Settings** — providers, connectors, budgets, sub-agent gates. ADO import: `POST /api/import` `{ "action": "ado" }`.

## Layout

| Path | Role |
|---|---|
| `agents/*.md` | Agent prompts (shared library) |
| `workstreams/*.md` | Pipeline / job templates (agent + command stages) |
| `tickets/*.md` | Local ticket copies |
| `data/store.json` | Board state |
| `src/lib/runtimes/` | Harness registry (`demo`, `opencode`, `cursor`, `command`) |
| `docs/SPEC.md` | **Full product & technical specification** (keep current) |
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
