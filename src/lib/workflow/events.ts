import { randomUUID } from "crypto";
import { updateStore, readStore } from "../db";
import type { WorkflowEvent, WorkflowEventType, WorkflowProjection } from "./types";

declare module "../db" {
  // extended at runtime on Store
}

function ensureEventsArray() {
  updateStore((s) => {
    if (!(s as { events?: WorkflowEvent[] }).events) {
      (s as { events?: WorkflowEvent[] }).events = [];
    }
  });
}

export function appendWorkflowEvent(
  ticketId: string,
  type: WorkflowEventType | string,
  payload: Record<string, unknown> = {},
): WorkflowEvent {
  ensureEventsArray();
  const event: WorkflowEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type,
    ticketId,
    payload,
  };
  updateStore((s) => {
    const store = s as { events?: WorkflowEvent[] };
    if (!store.events) store.events = [];
    store.events.push(event);
    // Cap history per process store (keep last 5000 globally)
    if (store.events.length > 5000) {
      store.events = store.events.slice(-5000);
    }
  });
  return event;
}

export function listWorkflowEvents(ticketId?: string): WorkflowEvent[] {
  const store = readStore() as { events?: WorkflowEvent[] };
  const all = store.events || [];
  if (!ticketId) return all.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return all
    .filter((e) => e.ticketId === ticketId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Derive workflow projection from the event stream for a ticket.
 * Replay-friendly: state is a fold over events.
 */
export function projectWorkflowState(ticketId: string): WorkflowProjection {
  const events = listWorkflowEvents(ticketId);
  let currentNodeId: string | null = null;
  let status = "inbox";
  let lastResultStatus: WorkflowProjection["lastResultStatus"] = null;

  for (const e of events) {
    switch (e.type) {
      case "TicketCreated":
        status = "inbox";
        currentNodeId = null;
        break;
      case "StageEntered":
      case "WorkflowTransitionRequested":
        currentNodeId = String(e.payload.nodeId || e.payload.to || currentNodeId || "");
        if (!currentNodeId) currentNodeId = null;
        if (currentNodeId === "human:review") status = "pending_review";
        else if (currentNodeId === "human:needs") status = "needs_human";
        else if (currentNodeId === "end") status = "complete";
        else if (currentNodeId) status = "queued";
        break;
      case "StageStarted":
        status = "running";
        if (e.payload.nodeId) currentNodeId = String(e.payload.nodeId);
        break;
      case "StageCompleted":
        lastResultStatus = "success";
        status = "queued";
        break;
      case "StageFailed":
        lastResultStatus = "failure";
        break;
      case "StageRetryRequested":
        lastResultStatus = "retry";
        break;
      case "ReviewRequested":
        status = "pending_review";
        currentNodeId = "human:review";
        break;
      case "ReviewApproved":
        status = "complete";
        currentNodeId = "end";
        break;
      case "ReviewRejected":
      case "ChangesRequested":
        status = e.type === "ReviewRejected" ? "needs_human" : "queued";
        if (e.payload.nodeId) currentNodeId = String(e.payload.nodeId);
        break;
      case "BudgetExceeded":
        status = "needs_human";
        break;
      case "TicketDeleted":
        status = "deleted";
        break;
      default:
        break;
    }
  }

  return {
    ticketId,
    currentNodeId,
    status,
    lastResultStatus,
    eventCount: events.length,
  };
}

export function clearWorkflowEventsForTicket(ticketId: string) {
  updateStore((s) => {
    const store = s as { events?: WorkflowEvent[] };
    if (!store.events) return;
    store.events = store.events.filter((e) => e.ticketId !== ticketId);
  });
}
