---
id: dotnet-feature
name: .NET feature
kind: pipeline
color: "#512bd4"
stages:
  - planner
  - implementer
  - kind: validator
    id: build
    title: Build validator
    validator: dotnet_build
    onFailure: implementer
  - kind: validator
    id: test
    title: Test validator
    validator: dotnet_test
    onFailure: implementer
  - kind: agent
    agentId: reviewer
    onFailure: planner
    onSuccess: review
git: true
completeAction: commit_and_pr
defaultLabels:
  - feature
  - dotnet
onRequestChanges: planner
defaultOnFailure: planner
---

.NET graph: plan → implement → build validator → test validator → reviewer → Review.

Validator fail → implementer. Reviewer fail → planner.
