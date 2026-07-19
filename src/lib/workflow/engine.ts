import type { WorkstreamDef } from "../types";
import type { AgentResult, WorkflowGraph, WorkflowNode } from "./types";
import {
  firstExecutableNodeId,
  getNode,
  getWorkflowGraph,
  isEndNode,
  isHumanReviewNode,
  isNeedsHumanNode,
  selectNextNode,
  startNodeId,
} from "./graph";
import { resultToEdgeCondition } from "./contract";

export type TransitionDecision =
  | { kind: "enter"; nodeId: string; node: WorkflowNode }
  | { kind: "review" }
  | { kind: "needs_human"; reason: string }
  | { kind: "complete" }
  | { kind: "retry"; nodeId: string }
  | { kind: "stay"; reason: string };

/**
 * Pure transition: given graph + current node + AgentResult → next action.
 * Used by orchestrator and workflow tests (no I/O).
 */
export function decideTransition(opts: {
  graph: WorkflowGraph;
  currentNodeId: string | null;
  result: AgentResult | null;
}): TransitionDecision {
  const { graph, result } = opts;
  let currentNodeId = opts.currentNodeId;

  if (!currentNodeId) {
    const first = firstExecutableNodeId(graph) || startNodeId(graph);
    const node = getNode(graph, first);
    if (!node) return { kind: "stay", reason: "No start node" };
    if (node.type === "start") {
      const next = selectNextNode(graph, node.id, "always");
      if (!next) return { kind: "stay", reason: "Start has no edge" };
      const n = getNode(graph, next);
      if (!n) return { kind: "stay", reason: "Missing next after start" };
      return classifyEnter(n);
    }
    return classifyEnter(node);
  }

  if (!result) {
    const node = getNode(graph, currentNodeId);
    if (!node) return { kind: "stay", reason: "Unknown current node" };
    return classifyEnter(node);
  }

  const condition = resultToEdgeCondition(result);
  if (condition === "retry") {
    return { kind: "retry", nodeId: currentNodeId };
  }

  // Soft advance/rework overrides via outputs
  const advanceTo = result.outputs.advanceTo || result.outputs.advanceAgentId;
  const reworkTo = result.outputs.reworkTo || result.outputs.reworkAgentId;
  if (result.status === "success" && typeof advanceTo === "string" && advanceTo) {
    const mapped = mapSpecialTarget(graph, String(advanceTo));
    const node = getNode(graph, mapped);
    if (node) return classifyEnter(node);
  }
  if (result.status === "failure" && typeof reworkTo === "string" && reworkTo) {
    if (reworkTo === "needs_human") {
      return { kind: "needs_human", reason: result.summary };
    }
    const mapped = mapSpecialTarget(graph, String(reworkTo));
    const node = getNode(graph, mapped);
    if (node) return classifyEnter(node);
  }

  const nextId = selectNextNode(graph, currentNodeId, condition);
  if (!nextId) {
    if (result.status === "failure" || result.status === "needs_human") {
      return { kind: "needs_human", reason: result.summary };
    }
    return { kind: "review" };
  }

  const next = getNode(graph, nextId);
  if (!next) return { kind: "stay", reason: `Missing node ${nextId}` };
  return classifyEnter(next);
}

function classifyEnter(node: WorkflowNode): TransitionDecision {
  if (isEndNode(node)) return { kind: "complete" };
  if (isHumanReviewNode(node)) return { kind: "review" };
  if (isNeedsHumanNode(node)) {
    return { kind: "needs_human", reason: "Routed to Needs human" };
  }
  return { kind: "enter", nodeId: node.id, node };
}

function mapSpecialTarget(graph: WorkflowGraph, target: string): string {
  if (target === "review" || target === "complete" || target === "pending_review") {
    return "human:review";
  }
  if (target === "needs_human") return "human:needs";
  if (target === "next") {
    return firstExecutableNodeId(graph) || "human:review";
  }
  if (target.startsWith("agent:") || target.startsWith("command:") || target.startsWith("human:")) {
    return target;
  }
  const byAgent = graph.nodes.find(
    (n) =>
      n.id === `agent:${target}` ||
      n.id === `command:${target}` ||
      n.configuration.agentId === target ||
      n.configuration.commandId === target,
  );
  return byAgent?.id || `agent:${target}`;
}

export function graphForWorkstream(ws: WorkstreamDef): WorkflowGraph {
  return getWorkflowGraph(ws);
}

export function nodeIdForColumnAgent(
  graph: WorkflowGraph,
  columnAgentId: string | null,
): string | null {
  if (!columnAgentId) return null;
  if (columnAgentId.startsWith("command:")) {
    return (
      graph.nodes.find(
        (n) =>
          n.id === columnAgentId ||
          n.configuration.commandId === columnAgentId.replace(/^command:/, ""),
      )?.id || columnAgentId
    );
  }
  if (columnAgentId.startsWith("validator:")) {
    return (
      graph.nodes.find(
        (n) =>
          n.id === columnAgentId ||
          n.configuration.validatorId === columnAgentId.replace(/^validator:/, ""),
      )?.id || columnAgentId
    );
  }
  return (
    graph.nodes.find(
      (n) => n.id === `agent:${columnAgentId}` || n.configuration.agentId === columnAgentId,
    )?.id || `agent:${columnAgentId}`
  );
}
