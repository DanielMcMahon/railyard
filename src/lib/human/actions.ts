import { randomUUID } from "crypto";
import { readStore, updateStore } from "../db";
import { appendWorkflowEvent } from "../workflow/events";
import type {
  ActionButton,
  ActionButtonId,
  ActionRequest,
  ActionRequestType,
  ActionSeverity,
} from "./types";

export type CreateActionInput = {
  ticketId: string;
  type: ActionRequestType;
  severity?: ActionSeverity;
  title: string;
  description: string;
  requestedBy: string;
  actions?: ActionButton[];
  metadata?: Record<string, unknown>;
  /** If true, skip creating when an open request of same type+ticket exists */
  dedupe?: boolean;
};

const DEFAULT_ACTIONS: Record<ActionRequestType, ActionButton[]> = {
  approval: [
    { id: "approve", label: "Approve", primary: true },
    { id: "deny", label: "Deny" },
    { id: "request_changes", label: "Request changes" },
  ],
  permission: [
    { id: "approve", label: "Grant", primary: true },
    { id: "deny", label: "Deny" },
    { id: "modify", label: "Modify" },
  ],
  error: [
    { id: "retry", label: "Retry", primary: true },
    { id: "resume", label: "Resume" },
    { id: "ack", label: "Acknowledge" },
  ],
  question: [
    { id: "approve", label: "Yes", primary: true },
    { id: "deny", label: "No" },
    { id: "ack", label: "Dismiss" },
  ],
  verification: [
    { id: "approve", label: "Verified", primary: true },
    { id: "deny", label: "Failed" },
    { id: "request_changes", label: "Needs work" },
  ],
};

function ensureActionsArray(store: { actionRequests?: ActionRequest[] }) {
  if (!store.actionRequests) store.actionRequests = [];
}

export function listActionRequests(opts?: {
  status?: ActionRequest["status"] | "all";
  ticketId?: string;
}): ActionRequest[] {
  const store = readStore() as ReturnType<typeof readStore> & {
    actionRequests?: ActionRequest[];
  };
  let list = store.actionRequests || [];
  if (opts?.ticketId) list = list.filter((a) => a.ticketId === opts.ticketId);
  if (opts?.status && opts.status !== "all") {
    list = list.filter((a) => a.status === opts.status);
  }
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getActionRequest(id: string): ActionRequest | null {
  return listActionRequests({ status: "all" }).find((a) => a.id === id) || null;
}

export function countOpenActions(): number {
  return listActionRequests({ status: "open" }).length;
}

export function createActionRequest(input: CreateActionInput): ActionRequest {
  const now = new Date().toISOString();
  let created: ActionRequest | null = null;

  updateStore((s) => {
    const store = s as typeof s & { actionRequests?: ActionRequest[] };
    ensureActionsArray(store);
    if (input.dedupe !== false) {
      const existing = store.actionRequests!.find(
        (a) =>
          a.status === "open" &&
          a.ticketId === input.ticketId &&
          a.type === input.type &&
          a.title === input.title,
      );
      if (existing) {
        created = existing;
        return;
      }
    }
    const req: ActionRequest = {
      id: randomUUID(),
      ticketId: input.ticketId,
      createdAt: now,
      resolvedAt: null,
      type: input.type,
      severity: input.severity || "warning",
      title: input.title,
      description: input.description,
      requestedBy: input.requestedBy,
      actions: input.actions || DEFAULT_ACTIONS[input.type],
      status: "open",
      resolution: null,
      resolutionNote: null,
      metadata: input.metadata || {},
    };
    store.actionRequests!.push(req);
    created = req;
  });

  const req = created!;
  appendWorkflowEvent(input.ticketId, "ActionRequested", {
    actionId: req.id,
    type: req.type,
    title: req.title,
    severity: req.severity,
  });
  return req;
}

export function resolveActionRequest(
  id: string,
  resolution: ActionButtonId,
  note?: string,
): ActionRequest {
  let resolved: ActionRequest | null = null;
  updateStore((s) => {
    const store = s as typeof s & { actionRequests?: ActionRequest[] };
    ensureActionsArray(store);
    const hit = store.actionRequests!.find((a) => a.id === id);
    if (!hit) throw new Error("Action request not found");
    if (hit.status !== "open") throw new Error("Action already resolved");
    hit.status = "resolved";
    hit.resolvedAt = new Date().toISOString();
    hit.resolution = resolution;
    hit.resolutionNote = note || null;
    resolved = hit;
  });
  const req = resolved!;
  appendWorkflowEvent(req.ticketId, "ActionResolved", {
    actionId: req.id,
    resolution,
    note: note || null,
  });
  return req;
}

export function dismissActionRequest(id: string, note?: string): ActionRequest {
  let dismissed: ActionRequest | null = null;
  updateStore((s) => {
    const store = s as typeof s & { actionRequests?: ActionRequest[] };
    ensureActionsArray(store);
    const hit = store.actionRequests!.find((a) => a.id === id);
    if (!hit) throw new Error("Action request not found");
    hit.status = "dismissed";
    hit.resolvedAt = new Date().toISOString();
    hit.resolution = "ack";
    hit.resolutionNote = note || null;
    dismissed = hit;
  });
  return dismissed!;
}
