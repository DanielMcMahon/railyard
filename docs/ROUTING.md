# Stage routing (success & failure)

Workstream stages can jump to a specific agent (or Review / Needs human) instead of only moving linearly.

## Workstream YAML

```yaml
stages:
  - planner
  - implementer
  - kind: agent
    agentId: reviewer
    onFailure: planner      # stage fail / rework fence → planner
    onSuccess: review       # success → human Review (not next column)
onRequestChanges: planner   # human Request changes → planner
defaultOnFailure: planner   # fallback when a stage has no onFailure
```

### `onSuccess` values

| Value | Behaviour |
|---|---|
| `next` (default) | Linear next stage; last stage → Review |
| `review` | Park in Review (`pending_review`) |
| `needs_human` | Needs human column |
| `<agentId>` | Jump to that stage column and run |

### `onFailure` / `defaultOnFailure` / `onRequestChanges`

| Value | Behaviour |
|---|---|
| omitted / null | Needs human (or stream default) |
| `<agentId>` | Queue that agent with the failure reason in notes |

## Agent fences

**Rework (soft failure):**

````markdown
```railyard-rework
{ "agentId": "planner", "reason": "…" }
```
````

**Advance (soft success jump):**

````markdown
```railyard-advance
{ "agentId": "implementer" }
```
````

or `{ "to": "review" }` / `{ "to": "next" }` / `{ "to": "needs_human" }`.

Fence overrides take precedence over stage YAML for that run. Stage YAML overrides workstream defaults. Linear `next` remains the default when nothing is set.

Configure the same options in **Workstreams** UI (per-stage On failure / On success + stream Request-changes / Default on failure).
