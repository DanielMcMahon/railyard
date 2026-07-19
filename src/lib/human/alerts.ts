import { randomUUID } from "crypto";
import { readStore, updateStore } from "../db";
import { appendWorkflowEvent } from "../workflow/events";
import type { ActionSeverity, WorkflowAlert, WorkflowAlertKind } from "./types";

export type CreateAlertInput = {
  ticketId?: string | null;
  kind: WorkflowAlertKind;
  severity?: ActionSeverity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
};

function ensureAlerts(store: { alerts?: WorkflowAlert[] }) {
  if (!store.alerts) store.alerts = [];
}

export function listAlerts(opts?: {
  acknowledged?: boolean;
  ticketId?: string;
  limit?: number;
}): WorkflowAlert[] {
  const store = readStore() as ReturnType<typeof readStore> & {
    alerts?: WorkflowAlert[];
  };
  let list = store.alerts || [];
  if (opts?.ticketId) list = list.filter((a) => a.ticketId === opts.ticketId);
  if (opts?.acknowledged !== undefined) {
    list = list.filter((a) => a.acknowledged === opts.acknowledged);
  }
  list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (opts?.limit) list = list.slice(0, opts.limit);
  return list;
}

export function countUnackedAlerts(): number {
  return listAlerts({ acknowledged: false }).length;
}

export function raiseAlert(input: CreateAlertInput): WorkflowAlert {
  const alert: WorkflowAlert = {
    id: randomUUID(),
    ticketId: input.ticketId ?? null,
    createdAt: new Date().toISOString(),
    kind: input.kind,
    severity: input.severity || "warning",
    title: input.title,
    message: input.message,
    acknowledged: false,
    metadata: input.metadata || {},
  };

  updateStore((s) => {
    const store = s as typeof s & { alerts?: WorkflowAlert[] };
    ensureAlerts(store);
    store.alerts!.unshift(alert);
    // Cap feed size
    if (store.alerts!.length > 500) store.alerts = store.alerts!.slice(0, 500);
  });

  if (input.ticketId) {
    appendWorkflowEvent(input.ticketId, "AlertRaised", {
      alertId: alert.id,
      kind: alert.kind,
      title: alert.title,
      severity: alert.severity,
    });
  }
  return alert;
}

export function acknowledgeAlert(id: string): WorkflowAlert {
  let hit: WorkflowAlert | null = null;
  updateStore((s) => {
    const store = s as typeof s & { alerts?: WorkflowAlert[] };
    ensureAlerts(store);
    const a = store.alerts!.find((x) => x.id === id);
    if (!a) throw new Error("Alert not found");
    a.acknowledged = true;
    hit = a;
  });
  return hit!;
}

export function acknowledgeAllAlerts(): number {
  let n = 0;
  updateStore((s) => {
    const store = s as typeof s & { alerts?: WorkflowAlert[] };
    ensureAlerts(store);
    for (const a of store.alerts!) {
      if (!a.acknowledged) {
        a.acknowledged = true;
        n++;
      }
    }
  });
  return n;
}
