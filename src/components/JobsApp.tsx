"use client";

import { useCallback, useEffect, useState } from "react";
import { Shell } from "./Shell";
import type { TicketRow } from "@/lib/types";

type Queue = {
  jobs: Array<{
    id: string;
    name: string;
    trigger: { type: string; expression?: string } | null;
    stages: unknown[];
  }>;
  tickets: TicketRow[];
  state: { lastTickAt: string | null; lastFired: Record<string, string> };
};

export function JobsApp() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [log, setLog] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/jobs", { cache: "no-store" });
    setQueue((await res.json()) as Queue);
  }, []);

  useEffect(() => {
    refresh().catch((e) => setLog(String(e)));
  }, [refresh]);

  async function tick() {
    setBusy(true);
    try {
      const res = await fetch("/api/jobs/tick", { method: "POST" });
      const json = await res.json();
      setLog(JSON.stringify(json, null, 2));
      await refresh();
    } catch (e) {
      setLog(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            className="text-2xl font-bold"
            style={{ fontFamily: "var(--font-syne, var(--font-display))" }}
          >
            Job streams
          </h2>
          <p className="text-sm opacity-60">
            Cron-backed single-runner queues. External cron can POST /api/jobs/tick.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={tick}
          className="rounded-full px-4 py-2 text-sm font-medium"
          style={{ background: "#14212b", color: "#f3eee6" }}
        >
          Tick now
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide opacity-55">Definitions</h3>
          {(queue?.jobs || []).map((j) => (
            <div
              key={j.id}
              className="rounded-xl border border-[var(--rail-line)] bg-white/60 px-4 py-3"
            >
              <div className="font-semibold">{j.name}</div>
              <div className="text-xs opacity-60" style={{ fontFamily: "var(--font-mono)" }}>
                {j.id}
                {" · "}
                {j.trigger?.type === "cron"
                  ? `cron ${j.trigger.expression}`
                  : j.trigger?.type || "manual"}
                {" · last "}
                {queue?.state.lastFired[j.id] || "never"}
              </div>
            </div>
          ))}
          {!queue?.jobs?.length && (
            <p className="text-sm opacity-60">No kind=job workstreams yet.</p>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide opacity-55">Queue</h3>
          {(queue?.tickets || []).map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-[var(--rail-line)] bg-white/60 px-4 py-3 text-sm"
            >
              <div className="font-medium">{t.title}</div>
              <div className="text-xs opacity-60">
                {t.status} · {t.workstreamId}
              </div>
            </div>
          ))}
          {!queue?.tickets?.length && (
            <p className="text-sm opacity-60">No job tickets yet. Tick to create one when due.</p>
          )}
        </div>
      </div>

      {log && (
        <pre className="mt-6 max-h-64 overflow-auto rounded-xl border border-[var(--rail-line)] bg-black/5 p-3 text-xs">
          {log}
        </pre>
      )}
    </Shell>
  );
}
