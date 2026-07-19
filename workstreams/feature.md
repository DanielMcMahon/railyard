---
id: feature
name: Feature implementation
kind: pipeline
color: "#3d5a80"
stages:
  - planner
  - implementer
  - kind: agent
    agentId: reviewer
    onFailure: planner
    onSuccess: review
git: true
completeAction: commit_and_pr
defaultLabels:
  - feature
onRequestChanges: planner
defaultOnFailure: planner
---

Feature pipeline (linear YAML auto-translated to a workflow graph at runtime):

START → planner → implementer → reviewer → human Review → END

- Reviewer fail / request-changes → planner
- Reviewer success → Review (approve required before PR)
See `docs/WORKFLOW.md` for graph, AgentResult, validators, and events.
