# Railyard — Agent instructions

## Spec is canonical

[`docs/SPEC.md`](docs/SPEC.md) is the full product and technical specification. **Keep it up to date.**

After any change that alters user-visible behaviour, APIs, settings, workstream/agent contracts, security posture, or explicit limitations:

1. Update the relevant sections of `docs/SPEC.md`.
2. Bump the **Version** date at the top of that file.
3. Update focused docs if needed (`docs/ROUTING.md`, `docs/SUB_AGENTS.md`, `docs/SECURITY.md`, `docs/JOB_STREAMS.md`, `docs/ROADMAP.md`, `README.md`).

Do not leave SPEC describing removed or unfinished features as if they shipped.

## Boot

- Prefer repository-native docs over chat memory.
- Never store secrets in markdown or the git tree (`data/providers.json` / `data/connectors.json` stay gitignored).
- Never commit or push unless the user explicitly asks.

## Local-only

Bind remains `127.0.0.1`. No authentication by design — see `docs/SECURITY.md`.
