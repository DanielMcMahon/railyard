"use client";

import { useCallback, useEffect, useState } from "react";
import { Shell } from "./Shell";
import type { ArchiveIndexEntry } from "@/lib/human/types";

export function ArchiveApp() {
  const [archives, setArchives] = useState<ArchiveIndexEntry[]>([]);
  const [selected, setSelected] = useState<ArchiveIndexEntry | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [agent, setAgent] = useState("");
  const [workstream, setWorkstream] = useState("");
  const [minCost, setMinCost] = useState("");
  const [humanOnly, setHumanOnly] = useState(false);

  const search = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (agent.trim()) params.set("agent", agent.trim());
    if (workstream.trim()) params.set("workstream", workstream.trim());
    if (minCost.trim()) params.set("minCost", minCost.trim());
    if (humanOnly) params.set("requiredHumanApproval", "true");
    const res = await fetch(`/api/archive?${params}`, { cache: "no-store" });
    const json = (await res.json()) as { archives: ArchiveIndexEntry[] };
    setArchives(json.archives || []);
  }, [q, agent, workstream, minCost, humanOnly]);

  useEffect(() => {
    search().catch((e) => setError(String(e)));
  }, [search]);

  async function open(entry: ArchiveIndexEntry) {
    setSelected(entry);
    setSummary(null);
    try {
      const res = await fetch(
        `/api/archive?path=${encodeURIComponent(entry.archivePath)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Failed to load archive");
      const json = (await res.json()) as { summary: string };
      setSummary(json.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Shell>
      <div className="mb-4">
        <h2
          className="text-2xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-syne, var(--font-display))" }}
        >
          Archive
        </h2>
        <p className="mt-1 text-sm opacity-60">
          Immutable case files under <code>Archive/YYYY/MM/DD/&lt;ticket&gt;/</code>
        </p>
      </div>

      <div className="mb-4 grid gap-2 rounded-xl border border-[var(--rail-line)] bg-white/60 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Search">
          <input
            className="w-full rounded-lg border border-[var(--rail-line)] px-2 py-1.5 text-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="title, id, branch…"
          />
        </Field>
        <Field label="Agent">
          <input
            className="w-full rounded-lg border border-[var(--rail-line)] px-2 py-1.5 text-sm"
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            placeholder="reviewer"
          />
        </Field>
        <Field label="Workstream">
          <input
            className="w-full rounded-lg border border-[var(--rail-line)] px-2 py-1.5 text-sm"
            value={workstream}
            onChange={(e) => setWorkstream(e.target.value)}
            placeholder="feature"
          />
        </Field>
        <Field label="Min cost $">
          <input
            className="w-full rounded-lg border border-[var(--rail-line)] px-2 py-1.5 text-sm"
            value={minCost}
            onChange={(e) => setMinCost(e.target.value)}
            placeholder="2"
          />
        </Field>
        <label className="flex items-end gap-2 pb-1 text-sm">
          <input
            type="checkbox"
            checked={humanOnly}
            onChange={(e) => setHumanOnly(e.target.checked)}
          />
          Required human approval
        </label>
      </div>

      {error && <p className="mb-2 text-xs text-[var(--rail-signal)]">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide opacity-50">
            {archives.length} case file{archives.length === 1 ? "" : "s"}
          </p>
          {archives.length === 0 && (
            <p className="rounded-xl border border-dashed border-[var(--rail-line)] px-4 py-8 text-center text-sm opacity-55">
              No archives yet — Approve & finish a ticket to generate a case file.
            </p>
          )}
          {archives.map((e) => (
            <button
              key={e.archivePath}
              type="button"
              onClick={() => open(e)}
              className="flex w-full flex-col rounded-xl border border-[var(--rail-line)] bg-white/70 px-4 py-3 text-left hover:bg-white"
              style={
                selected?.archivePath === e.archivePath
                  ? { outline: "2px solid #14212b" }
                  : undefined
              }
            >
              <span className="font-semibold">{e.title}</span>
              <span
                className="text-xs opacity-55"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {e.ticketId.slice(0, 8)} · {e.workstreamId || "—"} · $
                {e.costUsd.toFixed(3)} · {e.agents.join(", ") || "no agents"}
              </span>
              <span className="text-[11px] opacity-45">
                {new Date(e.archivedAt).toLocaleString()} · {e.archivePath}
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-[var(--rail-line)] bg-white/70 p-4">
          {!selected && (
            <p className="text-sm opacity-55">Select a case file to read its execution report.</p>
          )}
          {selected && (
            <>
              <h3 className="mb-2 text-lg font-semibold">{selected.title}</h3>
              <pre
                className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-lg bg-[#14212b] p-3 text-[11px] leading-relaxed text-[#e8e2d6]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {summary || "Loading…"}
              </pre>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-medium uppercase tracking-wide opacity-50">
        {label}
      </span>
      {children}
    </label>
  );
}
