import {
  approveTicket,
  rejectTicket,
  requestChangesTicket,
  scheduleBoard,
} from "../orchestrator";
import { getTicket, listAgentColumnsForTicket, moveTicket, updateTicket, listTickets } from "../board";
import { resolveActionRequest, getActionRequest } from "./actions";
import type { ActionButtonId } from "./types";

/**
 * Resolve a human ActionRequest and apply the corresponding board effect.
 */
export async function handleActionResolution(
  actionId: string,
  resolution: ActionButtonId,
  note?: string,
) {
  const before = getActionRequest(actionId);
  if (!before) throw new Error("Action not found");
  if (before.status !== "open") throw new Error("Action already resolved");

  const req = resolveActionRequest(actionId, resolution, note);
  const ticketId = req.ticketId;
  const ticket = getTicket(ticketId);

  switch (resolution) {
    case "approve":
      if (req.type === "approval" || req.metadata.kind === "review_gate") {
        await approveTicket(ticketId);
      }
      // permission grants are recorded; future stages may check metadata
      break;
    case "deny":
      if (req.type === "approval" || req.metadata.kind === "review_gate") {
        await rejectTicket(ticketId);
      }
      break;
    case "request_changes":
      await requestChangesTicket(ticketId);
      break;
    case "retry":
    case "resume": {
      if (!ticket) break;
      const cols = listAgentColumnsForTicket(ticket);
      const target =
        cols.find((c) => c.agentId === ticket.currentNodeId?.replace(/^agent:/, "")) ||
        cols[0];
      if (target) {
        moveTicket(
          ticketId,
          target.id,
          listTickets().filter((t) => t.columnId === target.id).length,
        );
        updateTicket(ticketId, {
          status: "queued",
          failureReason: null,
        });
        void scheduleBoard();
      }
      break;
    }
    case "ack":
    case "modify":
    default:
      break;
  }

  return { action: req, ticket: getTicket(ticketId) };
}
