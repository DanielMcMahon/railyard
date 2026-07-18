# Job streams

Pipeline workstreams (Feature / Bug / Research / .NET feature) are separate from **job** streams.

## Shape

```yaml
---
id: email-triage
name: Email triage
kind: job
color: "#5c6b73"
stages:
  - email-drafter   # optional single runner
git: false
completeAction: connector_reply
trigger:
  type: cron
  expression: "*/15 * * * *"
defaultLabels: [email]
---
```

## Runtime (implemented)

1. `POST /api/jobs/tick` (or Jobs UI **Tick now**) evaluates cron expressions (`*/N * * * *`).
2. When due, creates a ticket, moves to the first agent stage, and runs the agent (single-runner — skips if already queued/running for that stream).
3. Complete uses `completeAction` (e.g. `connector_reply` stub) instead of commit/PR when configured.
4. Sample stream: `workstreams/demo-job.md`.

## Also

- `GET /api/agents-md` — emit AGENTS.md from the library.
- `GET/POST /api/mcp` — read-only board status for Cursor.
