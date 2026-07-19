import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkstreamDef } from "../types";
import { stagesToGraph, selectNextNode, firstExecutableNodeId } from "./graph";
import { toAgentResult, resultToEdgeCondition } from "./contract";
import { decideTransition } from "./engine";
import { projectWorkflowState } from "./events";
import { updateStore } from "../db";
import type { WorkflowEvent } from "./types";

function featureWs(overrides: Partial<WorkstreamDef> = {}): WorkstreamDef {
  return {
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
    defaultLabels: ["feature"],
    trigger: null,
    defaultOnFailureAgentId: "planner",
    onRequestChangesAgentId: "planner",
    notes: "",
    filePath: "workstreams/feature.md",
    ...overrides,
  };
}

describe("workflow graph", () => {
  it("translates linear stages into start→agents→review→end", () => {
    const g = stagesToGraph(featureWs());
    assert.ok(g.nodes.some((n) => n.type === "start"));
    assert.ok(g.nodes.some((n) => n.id === "agent:planner"));
    assert.ok(g.nodes.some((n) => n.id === "human:review"));
    assert.ok(g.nodes.some((n) => n.type === "end"));
    const first = firstExecutableNodeId(g);
    assert.equal(first, "agent:planner");
    assert.equal(selectNextNode(g, "agent:planner", "success"), "agent:implementer");
  });

  it("routes reviewer failure to planner", () => {
    const g = stagesToGraph(featureWs());
    const next = selectNextNode(g, "agent:reviewer", "failure");
    assert.equal(next, "agent:planner");
  });

  it("routes reviewer success to human review", () => {
    const g = stagesToGraph(featureWs());
    const next = selectNextNode(g, "agent:reviewer", "success");
    assert.equal(next, "human:review");
  });
});

describe("AgentResult contract", () => {
  it("parses railyard-result fence", () => {
    const r = toAgentResult({
      ok: true,
      summary: '```railyard-result\n{"status":"failure","summary":"bad","confidence":0.2}\n```',
    });
    assert.equal(r.status, "failure");
    assert.equal(r.summary, "bad");
  });

  it("maps rework fence to failure", () => {
    const r = toAgentResult({
      ok: true,
      summary: '```railyard-rework\n{"agentId":"planner","reason":"fix tests"}\n```',
    });
    assert.equal(r.status, "failure");
    assert.equal(r.outputs.reworkAgentId, "planner");
  });

  it("maps ok runtime to success", () => {
    const r = toAgentResult({ ok: true, summary: "DONE" });
    assert.equal(r.status, "success");
    assert.equal(resultToEdgeCondition(r), "success");
  });
});

describe("decideTransition", () => {
  it("reviewer failure → enter planner", () => {
    const g = stagesToGraph(featureWs());
    const d = decideTransition({
      graph: g,
      currentNodeId: "agent:reviewer",
      result: toAgentResult({ ok: false, summary: "issues found" }),
    });
    assert.equal(d.kind, "enter");
    if (d.kind === "enter") assert.equal(d.nodeId, "agent:planner");
  });

  it("reviewer success → review gate (no PR)", () => {
    const g = stagesToGraph(featureWs());
    const d = decideTransition({
      graph: g,
      currentNodeId: "agent:reviewer",
      result: toAgentResult({ ok: true, summary: "DONE" }),
    });
    assert.equal(d.kind, "review");
  });

  it("request-changes from human:review → planner", () => {
    const g = stagesToGraph(featureWs());
    const d = decideTransition({
      graph: g,
      currentNodeId: "human:review",
      result: toAgentResult({ ok: false, summary: "Changes requested" }),
    });
    assert.equal(d.kind, "enter");
    if (d.kind === "enter") assert.equal(d.nodeId, "agent:planner");
  });

  it("retry loops to same node", () => {
    const g = stagesToGraph(featureWs());
    const d = decideTransition({
      graph: g,
      currentNodeId: "agent:implementer",
      result: {
        status: "retry",
        summary: "rate limit",
        confidence: 0.5,
        outputs: {},
        artifacts: [],
        metadata: {},
      },
    });
    assert.equal(d.kind, "retry");
    if (d.kind === "retry") assert.equal(d.nodeId, "agent:implementer");
  });
});

describe("event replay projection", () => {
  it("recreates pending_review from event history", () => {
    const ticketId = `test-${Date.now()}`;
    updateStore((s) => {
      const store = s as { events?: WorkflowEvent[] };
      store.events = [
        {
          id: "1",
          timestamp: "2026-01-01T00:00:00.000Z",
          type: "TicketCreated",
          ticketId,
          payload: {},
        },
        {
          id: "2",
          timestamp: "2026-01-01T00:01:00.000Z",
          type: "StageEntered",
          ticketId,
          payload: { nodeId: "agent:planner" },
        },
        {
          id: "3",
          timestamp: "2026-01-01T00:02:00.000Z",
          type: "ReviewRequested",
          ticketId,
          payload: {},
        },
      ];
    });
    const proj = projectWorkflowState(ticketId);
    assert.equal(proj.status, "pending_review");
    assert.equal(proj.currentNodeId, "human:review");
    assert.equal(proj.eventCount, 3);
  });
});
