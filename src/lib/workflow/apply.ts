import {
  getColumn,
  listColumns,
  listTickets,
  moveTicket,
  updateTicket,
  getTicket,
} from "../board";
import { agentColumnId, stageColumnId } from "../workstreams";
import { appendAgentNote } from "../tickets-fs";
import { appendWorkflowEvent } from "./events";
import type { AgentResult, WorkflowGraph, WorkflowNode } from "./types";
import { decideTransition, type TransitionDecision } from "./engine";
import { columnAgentIdForNode, getNode } from "./graph";
import { createActionRequest } from "../human/actions";
import { raiseAlert } from "../human/alerts";

/**
 * Apply a graph transition decision to the board (I/O).
 * Emits workflow events for audit/replay.
 */
export async function applyTransition(opts: {
  ticketId: string;
  workstreamId: string;
  graph: WorkflowGraph;
  currentNodeId: string | null;
  result: AgentResult | null;
  scheduleColumn?: (columnId: string) => void | Promise<void>;
  parkForReview: (ticketId: string) => Promise<void>;
  noteTitle?: string;
}): Promise<TransitionDecision> {
  const decision = decideTransition({
    graph: opts.graph,
    currentNodeId: opts.currentNodeId,
    result: opts.result,
  });

  const ticket = getTicket(opts.ticketId);
  if (!ticket) return decision;

  if (opts.result) {
    if (opts.result.status === "success") {
      appendWorkflowEvent(opts.ticketId, "StageCompleted", {
        nodeId: opts.currentNodeId,
        summary: opts.result.summary,
        confidence: opts.result.confidence,
      });
    } else if (opts.result.status === "retry") {
      appendWorkflowEvent(opts.ticketId, "StageRetryRequested", {
        nodeId: opts.currentNodeId,
        summary: opts.result.summary,
      });
    } else {
      appendWorkflowEvent(opts.ticketId, "StageFailed", {
        nodeId: opts.currentNodeId,
        summary: opts.result.summary,
        status: opts.result.status,
      });
    }
  }

  switch (decision.kind) {
    case "retry": {
      appendWorkflowEvent(opts.ticketId, "WorkflowTransitionRequested", {
        to: decision.nodeId,
        reason: "retry",
      });
      updateTicket(opts.ticketId, {
        currentNodeId: decision.nodeId,
        status: "queued",
        failureReason: opts.result?.summary || "Retry requested",
      });
      const col = columnForNode(opts.workstreamId, opts.graph, decision.nodeId);
      if (col) {
        moveTicket(opts.ticketId, col.id, 0);
        void opts.scheduleColumn?.(col.id);
      }
      break;
    }
    case "review": {
      appendWorkflowEvent(opts.ticketId, "ReviewRequested", {
        from: opts.currentNodeId,
      });
      updateTicket(opts.ticketId, { currentNodeId: "human:review" });
      await opts.parkForReview(opts.ticketId);
      break;
    }
    case "complete": {
      appendWorkflowEvent(opts.ticketId, "WorkflowTransitionRequested", {
        to: "end",
      });
      updateTicket(opts.ticketId, { currentNodeId: "end" });
      await opts.parkForReview(opts.ticketId);
      break;
    }
    case "needs_human": {
      appendWorkflowEvent(opts.ticketId, "WorkflowTransitionRequested", {
        to: "human:needs",
        reason: decision.reason,
      });
      const needs = listColumns().find((c) => c.kind === "needs_human");
      if (needs) moveTicket(opts.ticketId, needs.id, 0);
      updateTicket(opts.ticketId, {
        status: "needs_human",
        currentNodeId: "human:needs",
        failureReason: decision.reason,
      });
      raiseAlert({
        ticketId: opts.ticketId,
        kind: "needs_human",
        severity: "warning",
        title: "Needs human",
        message: decision.reason,
      });
      createActionRequest({
        ticketId: opts.ticketId,
        type: "error",
        severity: "warning",
        title: "Needs human intervention",
        description: decision.reason,
        requestedBy: opts.noteTitle || "workflow",
        metadata: { kind: "needs_human", fromNode: opts.currentNodeId },
      });
      appendAgentNote(
        ticket.filePath,
        opts.noteTitle || "Needs human",
        decision.reason,
      );
      break;
    }
    case "enter": {
      appendWorkflowEvent(opts.ticketId, "WorkflowTransitionRequested", {
        to: decision.nodeId,
        nodeId: decision.nodeId,
      });
      appendWorkflowEvent(opts.ticketId, "StageEntered", {
        nodeId: decision.nodeId,
        type: decision.node.type,
      });
      updateTicket(opts.ticketId, {
        currentNodeId: decision.nodeId,
        status: "queued",
        failureReason:
          opts.result?.status === "failure" || opts.result?.status === "needs_human"
            ? opts.result.summary
            : null,
        workstreamId: opts.workstreamId,
      });
      const col = columnForNode(opts.workstreamId, opts.graph, decision.nodeId, decision.node);
      if (col) {
        moveTicket(
          opts.ticketId,
          col.id,
          listTickets().filter((t) => t.columnId === col.id).length,
        );
        if (opts.result?.status !== "success" || decision.nodeId !== opts.currentNodeId) {
          appendAgentNote(
            ticket.filePath,
            opts.noteTitle || "Transition",
            `Entered node \`${decision.nodeId}\` (${decision.node.type}).${
              opts.result?.summary ? `\n\n${opts.result.summary}` : ""
            }`,
          );
        }
        void opts.scheduleColumn?.(col.id);
      } else if (decision.node.type === "agent") {
        // Node references agent not in stages — park needs human
        const needs = listColumns().find((c) => c.kind === "needs_human");
        if (needs) moveTicket(opts.ticketId, needs.id, 0);
        updateTicket(opts.ticketId, {
          status: "needs_human",
          failureReason: `No column for node ${decision.nodeId}`,
        });
      }
      break;
    }
    case "stay":
      break;
  }

  return decision;
}

function columnForNode(
  workstreamId: string,
  graph: WorkflowGraph,
  nodeId: string,
  node?: WorkflowNode,
) {
  const n = node || getNode(graph, nodeId);
  if (!n) return null;
  if (n.type === "agent") {
    const agentId = String(n.configuration.agentId || "");
    return getColumn(agentColumnId(workstreamId, agentId));
  }
  if (n.type === "command") {
    const id = String(n.configuration.commandId || "");
    return getColumn(`col-ws-${workstreamId}-cmd-${id}`);
  }
  if (n.type === "validator") {
    const id = String(n.configuration.validatorId || "");
    return getColumn(`col-ws-${workstreamId}-val-${id}`);
  }
  void columnAgentIdForNode;
  void stageColumnId;
  return null;
}
