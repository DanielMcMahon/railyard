# Railyard roadmap — Ultimate control plane

Local-only agent fleet control plane: tickets own intent; agents are swappable workers; you own policy (workstreams, budgets, approve gates). No authentication — loopback bind + `docs/SECURITY.md`.

**Canonical full specification:** [`docs/SPEC.md`](SPEC.md) (keep in sync with behaviour).

## Shipped

### Phase 1 — Review, cost, .NET gate, harness registry

- **Review-first Complete** — pipeline ends in **Review** (`pending_review`). Actions: Approve & finish, Request changes, Reject.
- **Cost / budget** — per-run token/cost estimates; Settings `budgetPerTicketUsd` / `budgetPerDayUsd` with hard-stop; day total on board header; cost chip on cards.
- **Command stages** — workstream stages may be `agent` or `command` (e.g. `dotnet test`). Ship `dotnet-feature` workstream.
- **Runtime registry** — `demo` | `opencode` | `cursor` | `command` under `src/lib/runtimes/`.

### Phase 2 — Parallel + observability

- Parallel: one running ticket per worktree/repo; `.railyard-lock` advisory lock.
- Run timeline from OpenCode/tool events in the ticket drawer.
- Prompt hash + summary stored per run (audit, no secret env).

### Phase 3 — PR + ADO

- Approve runs `gh pr create` when not in demo mode (soft-fail if `gh` missing).
- `POST /api/import` with `action: "ado"` — live WIQL when connector enabled, else demo items.
- ADO write-back comment on Approve; `requireApproveForImportedTickets`.

### Phase 4 — Jobs + portable policy

- `kind: job` + cron tick (`POST /api/jobs/tick`), Jobs UI at `/jobs`.
- `GET/POST /api/agents-md` — AGENTS.md from agent library.
- Read-only MCP stub at `/api/mcp`.

### Phase 5 — Cursor Agent SDK

- Structured Cursor runtime checks provider key and optionally detects `@cursor/sdk`; full streaming wire-up when API is ready.

## Out of scope (still)

- Multi-user auth, cloud hosting, Rider plugin, full Docker sandbox in early phases.
- Replacing OpenCode with a custom agent loop.
