# Workflow engine (vNext)

Railyard executes **workflow graphs**. Kanban columns are a projection of executable nodes.

## Graph model

- `WorkflowGraph` = nodes + edges (`src/lib/workflow/`)
- Legacy `stages: [planner, implementer, …]` auto-translates via `stagesToGraph()`
- Optional explicit `graph:` frontmatter can override translation later

Node types: `start` | `agent` | `command` | `validator` | `human` | `delay` | `end`  
Edge conditions: `always` | `success` | `failure` | `validation_pass` | `validation_fail` | `retry` | `needs_human` | `manual` | …

## AgentResult contract

Orchestrator routes on structured `AgentResult` only (`status`, `summary`, `confidence`, `outputs`, `artifacts`, `metadata`).  
Markdown logs stay for humans. Prefer:

````markdown
```railyard-result
{ "status": "success", "summary": "…", "confidence": 0.9 }
```
````

Legacy `railyard-rework` / `railyard-advance` fences still map into AgentResult.

## Validators

Stage kind `validator` with `validator: dotnet_build | dotnet_test | review | command`.  
See `dotnet-feature` workstream for build+test gates.

## Events

Append-only `events[]` in `data/store.json`. Types include StageStarted/Completed/Failed, Review*, BudgetExceeded, Validation*, etc.  
`projectWorkflowState(ticketId)` folds events into current node/status (replay).

## Tests

```bash
npm test
```

Pure transition tests live under `src/lib/workflow/*.test.ts`.
