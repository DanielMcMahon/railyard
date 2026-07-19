/**
 * Declarative workflow scenario helpers (YAML-like objects).
 * Used by tests and can drive future YAML fixtures under tests/workflows/.
 */
import type { WorkstreamDef } from "../types";
import { stagesToGraph } from "./graph";
import { toAgentResult } from "./contract";
import { decideTransition } from "./engine";
import type { AgentResult, AgentResultStatus } from "./types";

export type WorkflowScenario = {
  name: string;
  given: {
    workstream: WorkstreamDef;
    currentNodeId: string;
    agentResult: {
      status: AgentResultStatus;
      summary?: string;
      outputs?: Record<string, unknown>;
    };
  };
  expect: {
    kind: string;
    nodeId?: string;
    notComplete?: boolean;
  };
};

export function runScenario(scenario: WorkflowScenario) {
  const graph = stagesToGraph(scenario.given.workstream);
  const result: AgentResult = {
    ...toAgentResult({
      ok: scenario.given.agentResult.status === "success",
      summary: scenario.given.agentResult.summary || scenario.given.agentResult.status,
    }),
    status: scenario.given.agentResult.status,
    outputs: {
      ...toAgentResult({ ok: true, summary: "" }).outputs,
      ...(scenario.given.agentResult.outputs || {}),
    },
  };
  const decision = decideTransition({
    graph,
    currentNodeId: scenario.given.currentNodeId,
    result,
  });
  return { graph, decision };
}

export function assertScenario(scenario: WorkflowScenario) {
  const { decision } = runScenario(scenario);
  if (decision.kind !== scenario.expect.kind) {
    throw new Error(
      `${scenario.name}: expected kind ${scenario.expect.kind}, got ${decision.kind}`,
    );
  }
  if (scenario.expect.nodeId && decision.kind === "enter") {
    if (decision.nodeId !== scenario.expect.nodeId) {
      throw new Error(
        `${scenario.name}: expected node ${scenario.expect.nodeId}, got ${decision.nodeId}`,
      );
    }
  }
  if (scenario.expect.notComplete && decision.kind === "complete") {
    throw new Error(`${scenario.name}: expected not complete`);
  }
  return decision;
}
