"use client";

import { useCallback, useEffect, useState } from "react";
import { Shell } from "./Shell";
import type { ActionRequest } from "@/lib/human/types";
import type { WorkflowAlert } from "@/lib/human/types";

export function InboxApp() {
  const [actions, setActions] = useState<ActionRequest[]>([]);
  const [alerts, setAlerts] = useState<WorkflowAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"actions" | "alerts">("actions");

  const refresh = useCallback(async () => {
    const [aRes, alRes] = await Promise.all([
      fetch("/api/actions?status=open", { cache: "no-store" }),
      fetch("/api/alerts?acknowledged=false&limit=40", { cache: "no-store" }),
    ]);
    const aJson = (await aRes.json()) as { actions: ActionRequest[] };
    const alJson = (await alRes.json()) as { alerts: WorkflowAlert[] };
    setActions(aJson.actions || []);
    setAlerts(alJson.alerts || []);
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, [refresh]);

  async function resolve(id: string, resolution: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", id, resolution }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Resolve failed");
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function ackAlert(id: string) {
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ack", id }),
    });
    await refresh();
  }

  async function ackAll() {
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ackAll" }),
    });
    await refresh();
  }

  return (
    <Shell>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2
          className="text-2xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-syne, var(--font-display))" }}
        >
          Human inbox
        </h2>
        <div className="flex gap-1 rounded-full bg-white/50 p-1 text-sm">
          <TabBtn active={tab === "actions"} onClick={() => setTab("actions")}>
            Actions ({actions.length})
          </TabBtn>
          <TabBtn active={tab === "alerts"} onClick={() => setTab("alerts")}>
            Alerts ({alerts.length})
          </TabBtn>
        </div>
        {busy && <span className="text-xs opacity-50">Working…</span>}
        {error && <span className="text-xs text-[var(--rail-signal)]">{error}</span>}
      </div>

      {tab === "actions" && (
        <div className="space-y-3">
          {actions.length === 0 && (
            <p className="rounded-xl border border-dashed border-[var(--rail-line)] px-4 py-8 text-center text-sm opacity-55">
              No open action requests — permissions, approvals, and errors land here.
            </p>
          )}
          {actions.map((a) => (
            <article
              key={a.id}
              className="rounded-xl border border-[var(--rail-line)] bg-white/70 p-4"
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <SeverityBadge severity={a.severity} />
                <span className="text-[10px] uppercase tracking-wide opacity-50">
                  {a.type}
                </span>
                <span
                  className="text-xs opacity-45"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {a.ticketId.slice(0, 8)}…
                </span>
              </div>
              <h3 className="text-lg font-semibold">{a.title}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm opacity-75">{a.description}</p>
              <p className="mt-2 text-[11px] opacity-45">
                Requested by {a.requestedBy} · {new Date(a.createdAt).toLocaleString()}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {a.actions.map((btn) => (
                  <button
                    key={btn.id}
                    type="button"
                    disabled={busy}
                    onClick={() => resolve(a.id, btn.id)}
                    className="rounded-full px-3 py-1.5 text-sm font-medium"
                    style={
                      btn.primary
                        ? { background: "#14212b", color: "#f3eee6" }
                        : { background: "rgba(20,33,43,0.08)", color: "#14212b" }
                    }
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "alerts" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              className="text-xs opacity-60 hover:opacity-100"
              onClick={() => ackAll()}
            >
              Acknowledge all
            </button>
          </div>
          {alerts.length === 0 && (
            <p className="rounded-xl border border-dashed border-[var(--rail-line)] px-4 py-8 text-center text-sm opacity-55">
              No unacknowledged alerts.
            </p>
          )}
          {alerts.map((al) => (
            <article
              key={al.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-[var(--rail-line)] bg-white/70 px-4 py-3"
            >
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <SeverityBadge severity={al.severity} />
                  <span className="text-[10px] uppercase tracking-wide opacity-50">
                    {al.kind}
                  </span>
                </div>
                <div className="font-medium">{al.title}</div>
                <p className="text-sm opacity-70">{al.message}</p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-full px-3 py-1 text-xs"
                style={{ background: "rgba(20,33,43,0.08)" }}
                onClick={() => ackAlert(al.id)}
              >
                Ack
              </button>
            </article>
          ))}
        </div>
      )}
    </Shell>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1"
      style={
        active
          ? { background: "#14212b", color: "#f3eee6" }
          : { color: "#14212b" }
      }
    >
      {children}
    </button>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const color =
    severity === "critical"
      ? "#a33b2b"
      : severity === "warning"
        ? "#c45c26"
        : "#2f6f5e";
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
      style={{ background: color }}
    >
      {severity}
    </span>
  );
}
