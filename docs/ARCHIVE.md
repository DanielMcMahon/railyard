# Human inbox, alerts, and immutable archives

## Human Action Queue

Structured `ActionRequest` items (not only a Needs Human column):

- Types: approval | permission | error | question | verification
- Severity: info | warning | critical
- Buttons: Approve / Deny / Modify / Retry / …

Stored in `data/store.json` → `actionRequests[]`.  
UI: **Inbox** (`/inbox`). API: `GET/POST /api/actions`.

Raised automatically for:

- Review gate (Approve completion)
- Budget exceeded
- Workflow `needs_human` transitions
- Review reject

## Workflow Alerts

Independent notification feed (`alerts[]`): budget, review requested, validation, needs human, etc.  
Inbox → Alerts tab. API: `GET/POST /api/alerts`.

## Immutable Archive

On **Approve & finish**, Railyard writes a case file:

```
Archive/
  YYYY/
    MM/
      DD/
        <ticketId>/
          summary.md          # execution report
          timeline.json       # events, runs, actions, alerts
          ticket.md
          workflow.json
          manifest.json       # immutable: true
          artifacts/
          logs/
          prompts/            # hashes + metadata (not raw secrets)
          diffs/
```

Searchable index: `data/archive-index.json`.  
UI: **Archive** (`/archive`). API: `GET /api/archive`.

Archives are never overwritten in place; collisions get a time suffix.
