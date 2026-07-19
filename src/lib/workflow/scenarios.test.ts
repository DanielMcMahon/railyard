import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkstreamDef } from "../types";
import { assertScenario, type WorkflowScenario } from "./scenarios";
import { stagesToGraph, selectNextNode } from "./graph";
import { toAgentResult, resultToEdgeCondition } from "./contract";
import { decideTransition } from "./engine";
import { evaluateBudgetLimits } from "../cost";
import { gateSpawnRequests } from "../spawn";
import { DEFAULT_SETTINGS } from "../types";
import { projectWorkflowState } from "./events";
import { updateStore } from "../db";
import type { WorkflowEvent } from "./types";

const feature: WorkstreamDef = {
  id: "feature",
  name: "Feature",
  kind: "pipeline",
  color: "#000",
  stages: [
    { kind: "agent", agentId: "planner" },
    { kind: "agent", agentId: "implementer" },
    {
      kind: "agent",
      agentId: "reviewer",
      onFailureAgentId: "planner",
      onSuccess: "review",
    },
  ],
  git: true,
  completeAction: "commit_and_pr",
  defaultLabels: [],
  trigger: null,
  defaultOnFailureAgentId: "planner",
  onRequestChangesAgentId: "planner",
  notes: "",
  filePath: "",
};

const withValidators: WorkstreamDef = {
  ...feature,
  id: "dotnet-feature",
  stages: [
    { kind: "agent", agentId: "planner" },
    { kind: "agent", agentId: "implementer" },
    {
      kind: "validator",
      id: "test",
      title: "Test",
      validator: "dotnet_test",
      onFailureAgentId: "implementer",
    },
    {
      kind: "agent",
      agentId: "reviewer",
      onFailureAgentId: "planner",
      onSuccess: "review",
    },
  ],
};

describe("required workflow scenarios", () => {
  const cases: WorkflowScenario[] = [
    {
      name: "reviewer failure routes back to planner",
      given: {
        workstream: feature,
        currentNodeId: "agent:reviewer",
        agentResult: { status: "failure", summary: "issues" },
      },
      expect: { kind: "enter", nodeId: "agent:planner", notComplete: true },
    },
    {
      name: "approval gate — success parks at review (no complete)",
      given: {
        workstream: feature,
        currentNodeId: "agent:reviewer",
        agentResult: { status: "success", summary: "DONE" },
      },
      expect: { kind: "review", notComplete: true },
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      assertScenario(c);
    });
  }
});

describe("validation node routing", () => {
  it("validator fail → implementer", () => {
    const g = stagesToGraph(withValidators);
    const result = toAgentResult({
      ok: false,
      summary: "tests failed",
      metadata: { validation: true },
    });
    assert.equal(resultToEdgeCondition(result), "validation_fail");
    const next = selectNextNode(g, "validator:test", "validation_fail");
    assert.equal(next, "agent:implementer");
    const d = decideTransition({
      graph: g,
      currentNodeId: "validator:test",
      result,
    });
    assert.equal(d.kind, "enter");
    if (d.kind === "enter") assert.equal(d.nodeId, "agent:implementer");
  });

  it("validator pass → reviewer", () => {
    const g = stagesToGraph(withValidators);
    const result = toAgentResult({
      ok: true,
      summary: "tests ok",
      metadata: { validation: true },
    });
    const d = decideTransition({
      graph: g,
      currentNodeId: "validator:test",
      result,
    });
    assert.equal(d.kind, "enter");
    if (d.kind === "enter") assert.equal(d.nodeId, "agent:reviewer");
  });
});

describe("budget protection", () => {
  it("blocks new agent execution when ticket cost exceeds budget", () => {
    const check = evaluateBudgetLimits({
      budgetHardStop: true,
      ticketCost: 5,
      dayCost: 1,
      ticketLimit: 5,
      dayLimit: 25,
    });
    assert.equal(check.ok, false);
    if (!check.ok) assert.match(check.reason, /Ticket budget exceeded/);
  });

  it("allows execution when hard-stop disabled", () => {
    const check = evaluateBudgetLimits({
      budgetHardStop: false,
      ticketCost: 100,
      dayCost: 100,
      ticketLimit: 5,
      dayLimit: 25,
    });
    assert.equal(check.ok, true);
  });
});

describe("spawn limits", () => {
  it("rejects excessive spawning", () => {
    const gated = gateSpawnRequests(
      [
        { agentId: "implementer", task: "a" },
        { agentId: "reviewer", task: "b" },
        { agentId: "verify", task: "c" },
      ],
      {
        settings: {
          ...DEFAULT_SETTINGS,
          subAgentsEnabled: true,
          maxSpawnsPerRound: 1,
          maxSubAgentsPerStage: 10,
          maxSubAgentDepth: 2,
        },
        parentAgentId: "planner",
        depth: 0,
        launchedSoFar: 0,
        parentCanSpawn: true,
        roundsRemainingAfter: 2,
      },
    );
    assert.equal(gated.allowed.length, 1);
    assert.ok(gated.rejected.length >= 2);
  });
});

describe("replay test", () => {
  it("event history recreates the same workflow state", () => {
    const ticketId = `replay-${Date.now()}`;
    updateStore((s) => {
      const store = s as { events?: WorkflowEvent[] };
      store.events = [
        {
          id: "e1",
          timestamp: "2026-01-01T00:00:00.000Z",
          type: "TicketCreated",
          ticketId,
          payload: {},
        },
        {
          id: "e2",
          timestamp: "2026-01-01T00:01:00.000Z",
          type: "StageEntered",
          ticketId,
          payload: { nodeId: "agent:implementer" },
        },
        {
          id: "e3",
          timestamp: "2026-01-01T00:02:00.000Z",
          type: "ValidationFailed",
          ticketId,
          payload: {},
        },
        {
          id: "e4",
          timestamp: "2026-01-01T00:03:00.000Z",
          type: "StageEntered",
          ticketId,
          payload: { nodeId: "agent:implementer" },
        },
        {
          id: "e5",
          timestamp: "2026-01-01T00:04:00.000Z",
          type: "ReviewRequested",
          ticketId,
          payload: {},
        },
      ];
    });
    const a = projectWorkflowState(ticketId);
    const b = projectWorkflowState(ticketId);
    assert.deepEqual(a, b);
    assert.equal(a.status, "pending_review");
    assert.equal(a.currentNodeId, "human:review");
    assert.equal(a.eventCount, 5);
  });
});
