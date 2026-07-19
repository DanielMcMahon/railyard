import type { StageDef, WorkstreamDef } from "../types";
import type {
  WorkflowEdge,
  WorkflowEdgeCondition,
  WorkflowGraph,
  WorkflowNode,
} from "./types";

function stageNodeId(stage: StageDef): string {
  if (stage.kind === "agent") return `agent:${stage.agentId}`;
  if (stage.kind === "validator") return `validator:${stage.id}`;
  return `command:${stage.id}`;
}

function stageName(stage: StageDef): string {
  if (stage.kind === "agent") return stage.agentId;
  return stage.title || stage.id;
}

function stageConfig(stage: StageDef): Record<string, unknown> {
  if (stage.kind === "agent") {
    return {
      agentId: stage.agentId,
      onFailureAgentId: stage.onFailureAgentId ?? undefined,
      onSuccess: stage.onSuccess ?? undefined,
    };
  }
  if (stage.kind === "validator") {
    return {
      validatorId: stage.id,
      title: stage.title,
      validator: stage.validator,
      argv: stage.argv,
      onFailureAgentId: stage.onFailureAgentId ?? undefined,
      onSuccess: stage.onSuccess ?? undefined,
    };
  }
  return {
    commandId: stage.id,
    title: stage.title,
    argv: stage.argv,
    onFailureAgentId: stage.onFailureAgentId ?? undefined,
    onSuccess: stage.onSuccess ?? undefined,
  };
}

/**
 * Translate legacy linear `stages[]` (+ routing hints) into a WorkflowGraph.
 * Always includes start / human review / end terminals.
 */
export function stagesToGraph(ws: WorkstreamDef): WorkflowGraph {
  const nodes: WorkflowNode[] = [
    { id: "start", type: "start", name: "Start", configuration: {} },
    {
      id: "human:review",
      type: "human",
      name: "Review",
      configuration: { gate: "approve" },
    },
    {
      id: "human:needs",
      type: "human",
      name: "Needs human",
      configuration: { gate: "needs_human" },
    },
    { id: "end", type: "end", name: "End", configuration: {} },
  ];

  const edges: WorkflowEdge[] = [];
  const stageNodes = ws.stages.map((stage) => {
    const id = stageNodeId(stage);
    const type =
      stage.kind === "agent"
        ? ("agent" as const)
        : stage.kind === "validator"
          ? ("validator" as const)
          : ("command" as const);
    nodes.push({
      id,
      type,
      name: stageName(stage),
      configuration: stageConfig(stage),
    });
    return { stage, id };
  });

  if (stageNodes.length === 0) {
    edges.push({ from: "start", to: "human:review", condition: "always" });
  } else {
    edges.push({ from: "start", to: stageNodes[0]!.id, condition: "always" });
  }

  for (let i = 0; i < stageNodes.length; i++) {
    const { stage, id } = stageNodes[i]!;
    const nextId = stageNodes[i + 1]?.id;
    const onSuccess = stage.onSuccess || "next";

    // Success edges
    if (onSuccess === "review" || onSuccess === "complete" || onSuccess === "pending_review") {
      edges.push({ from: id, to: "human:review", condition: "success" });
    } else if (onSuccess === "needs_human") {
      edges.push({ from: id, to: "human:needs", condition: "success" });
    } else if (onSuccess !== "next") {
      const target = resolveAgentNodeId(onSuccess, stageNodes);
      edges.push({ from: id, to: target, condition: "success" });
    } else if (nextId) {
      edges.push({ from: id, to: nextId, condition: "success" });
    } else {
      edges.push({ from: id, to: "human:review", condition: "success" });
    }

    // Failure edges (+ validation_* aliases for validator nodes)
    const failTarget =
      stage.onFailureAgentId !== undefined
        ? stage.onFailureAgentId
        : ws.defaultOnFailureAgentId;
    if (failTarget) {
      const target = resolveAgentNodeId(failTarget, stageNodes);
      edges.push({ from: id, to: target, condition: "failure" });
      if (stage.kind === "validator") {
        edges.push({ from: id, to: target, condition: "validation_fail" });
      }
    } else {
      edges.push({ from: id, to: "human:needs", condition: "failure" });
      if (stage.kind === "validator") {
        edges.push({ from: id, to: "human:needs", condition: "validation_fail" });
      }
    }

    if (stage.kind === "validator") {
      const successEdge = edges.find((e) => e.from === id && e.condition === "success");
      if (successEdge) {
        edges.push({
          from: id,
          to: successEdge.to,
          condition: "validation_pass",
        });
      }
    }

    edges.push({ from: id, to: "human:needs", condition: "needs_human" });
    // retry loops back to self
    edges.push({ from: id, to: id, condition: "retry" });
  }

  // Human review → end (manual approve) or back via request-changes
  edges.push({ from: "human:review", to: "end", condition: "manual" });
  if (ws.onRequestChangesAgentId) {
    const target = resolveAgentNodeId(ws.onRequestChangesAgentId, stageNodes);
    edges.push({ from: "human:review", to: target, condition: "failure" });
  } else if (stageNodes.length) {
    edges.push({
      from: "human:review",
      to: stageNodes[stageNodes.length - 1]!.id,
      condition: "failure",
    });
  } else {
    edges.push({ from: "human:review", to: "human:needs", condition: "failure" });
  }

  edges.push({ from: "human:needs", to: "end", condition: "manual" });

  return {
    id: ws.id,
    name: ws.name,
    nodes,
    edges,
  };
}

function resolveAgentNodeId(
  agentId: string,
  stageNodes: Array<{ stage: StageDef; id: string }>,
): string {
  const hit = stageNodes.find(
    (s) =>
      (s.stage.kind === "agent" && s.stage.agentId === agentId) ||
      (s.stage.kind === "command" && s.stage.id === agentId) ||
      (s.stage.kind === "validator" && s.stage.id === agentId) ||
      s.id === agentId ||
      s.id === `agent:${agentId}` ||
      s.id === `command:${agentId}` ||
      s.id === `validator:${agentId}`,
  );
  return hit?.id || `agent:${agentId}`;
}

/** Optional explicit graph in workstream frontmatter overrides stages translation. */
export function parseExplicitGraph(raw: unknown, fallback: WorkstreamDef): WorkflowGraph | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) return null;
  return {
    id: String(g.id || fallback.id),
    name: String(g.name || fallback.name),
    nodes: g.nodes as WorkflowNode[],
    edges: g.edges as WorkflowEdge[],
  };
}

export function getWorkflowGraph(ws: WorkstreamDef & { graph?: unknown }): WorkflowGraph {
  const explicit = parseExplicitGraph((ws as { graph?: unknown }).graph, ws);
  if (explicit) return explicit;
  return stagesToGraph(ws);
}

export function getNode(graph: WorkflowGraph, nodeId: string): WorkflowNode | null {
  return graph.nodes.find((n) => n.id === nodeId) ?? null;
}

export function startNodeId(graph: WorkflowGraph): string {
  return graph.nodes.find((n) => n.type === "start")?.id || "start";
}

export function firstExecutableNodeId(graph: WorkflowGraph): string | null {
  const start = startNodeId(graph);
  const edge = graph.edges.find((e) => e.from === start && e.condition === "always");
  return edge?.to || null;
}

/**
 * Pick next node from outgoing edges matching the condition.
 * Prefer exact condition; fall back to `always`.
 */
export function selectNextNode(
  graph: WorkflowGraph,
  fromNodeId: string,
  condition: WorkflowEdgeCondition,
): string | null {
  const outgoing = graph.edges.filter((e) => e.from === fromNodeId);
  const exact = outgoing.find((e) => e.condition === condition);
  if (exact) return exact.to;
  // Validators emit validation_* conditions; legacy edges use success/failure.
  if (condition === "validation_pass") {
    const success = outgoing.find((e) => e.condition === "success");
    if (success) return success.to;
  }
  if (condition === "validation_fail") {
    const failure = outgoing.find((e) => e.condition === "failure");
    if (failure) return failure.to;
  }
  const always = outgoing.find((e) => e.condition === "always");
  return always?.to || null;
}

/** Map graph node id → kanban column agent_id convention. */
export function columnAgentIdForNode(node: WorkflowNode): string | null {
  if (node.type === "agent") {
    return String(node.configuration.agentId || node.id.replace(/^agent:/, ""));
  }
  if (node.type === "command") {
    const id = String(node.configuration.commandId || node.id);
    return id.startsWith("command:") ? id : `command:${id.replace(/^command:/, "")}`;
  }
  if (node.type === "validator") {
    const id = String(node.configuration.validatorId || node.id);
    return id.startsWith("validator:") ? id : `validator:${id.replace(/^validator:/, "")}`;
  }
  if (node.type === "human" && node.configuration.gate === "needs_human") return null;
  if (node.type === "human" && node.configuration.gate === "approve") return null;
  return null;
}

export function isHumanReviewNode(node: WorkflowNode | null): boolean {
  return Boolean(node && node.type === "human" && node.configuration.gate === "approve");
}

export function isNeedsHumanNode(node: WorkflowNode | null): boolean {
  return Boolean(node && node.type === "human" && node.configuration.gate === "needs_human");
}

export function isEndNode(node: WorkflowNode | null): boolean {
  return Boolean(node && node.type === "end");
}

/** Kanban columns still come from stages; graph may include validators not shown as columns yet. */
export function executableStageNodeIds(graph: WorkflowGraph): string[] {
  return graph.nodes
    .filter((n) => n.type === "agent" || n.type === "command" || n.type === "validator")
    .map((n) => n.id);
}
