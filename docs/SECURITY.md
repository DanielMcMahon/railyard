# Security (local-only)

Railyard is designed for **localhost use only**. There is no authentication — do not expose port 3000 to a LAN or the internet.

## Hardening in place

| Control | Behaviour |
|---------|-----------|
| Bind address | `npm run dev` / `start` use `--hostname 127.0.0.1` |
| Settings schema | Zod ceilings on spawn budgets; `repoPath` must be under `~/Documents` or `$HOME` and contain `.git` |
| Agent / workstream IDs | Slug-only (`a-z0-9-`); path containment under `agents/` / `workstreams/` |
| Provider / connector URLs | Block localhost, link-local, RFC1918, metadata hosts (override: `RAILYARD_ALLOW_LOCAL_FETCH=1`) |
| Outbound fetch | 15s timeout, `redirect: "error"` |
| OpenCode env | Minimal env (PATH/HOME/TMPDIR/OPENCODE*/XDG*) — not full `process.env` |
| Prompts | Ticket paths and sub-agent output wrapped as `<<<UNTRUSTED_*>>>` data |
| Logs | Basic secret redaction (Bearer, sk-, ghp_, …) |
| Import | Max 50 items, title/body/label size caps |
| Worktrees | Always under `.worktrees/<ticketId>` |

## What this does **not** stop

OpenCode/`--auto` can still run tools inside the worktree. Prompt delimiters reduce jailbreak success; they are not an OS sandbox. Prefer Demo mode or review tickets before autonomous runs on important repos.

## Local gateway exception

If you need a local OpenAI-compatible proxy:

```bash
RAILYARD_ALLOW_LOCAL_FETCH=1 npm run dev
```
