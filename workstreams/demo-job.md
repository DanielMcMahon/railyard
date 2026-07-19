---
id: demo-job
name: Demo cron job
kind: job
color: "#5c6b73"
stages:
  - writeup
git: false
completeAction: connector_reply
trigger:
  type: cron
  expression: "*/30 * * * *"
defaultLabels:
  - job
  - demo
---

Sample `kind: job` stream. Hit `POST /api/jobs/tick` (or open Jobs) to fire due crons.
Single-runner queue — skips if a ticket for this stream is already queued/running.
