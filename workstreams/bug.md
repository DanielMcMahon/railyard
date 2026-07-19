---
id: bug
name: Bug fix
kind: pipeline
color: "#a33b2b"
stages:
  - triage
  - reproduce
  - fix
  - kind: agent
    agentId: verify
    onFailure: triage
    onSuccess: review
git: true
completeAction: commit_and_pr
defaultLabels:
  - bug
onRequestChanges: triage
defaultOnFailure: triage
---

Bug pipeline: triage → reproduce → fix → verify → human Review.
Verify failure / request-changes → triage.
