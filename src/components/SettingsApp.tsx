"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { BoardDef, BoardSettings } from "@/lib/types";
import { Shell } from "./Shell";
import { ProvidersApp } from "./ProvidersApp";
import { ConnectorsApp } from "./ConnectorsApp";

type TabId = "board" | "boards" | "providers" | "connectors";

const TABS: { id: TabId; label: string }[] = [
  { id: "boards", label: "Boards" },
  { id: "board", label: "Runtime" },
  { id: "providers", label: "Providers" },
  { id: "connectors", label: "Connectors" },
];

function parseTab(raw: string | null): TabId {
  if (raw === "providers" || raw === "connectors" || raw === "board" || raw === "boards") {
    return raw;
  }
  return "boards";
}

export function SettingsApp() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = useMemo(() => parseTab(searchParams.get("tab")), [searchParams]);

  function setTab(next: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "boards") params.delete("tab");
    else params.set("tab", next);
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  return (
    <Shell>
      <div className="mb-5">
        <h2
          className="mb-1 text-3xl font-bold"
          style={{ fontFamily: "var(--font-syne, var(--font-display))" }}
        >
          Settings
        </h2>
        <p className="text-sm opacity-60">
          Boards (one repo each), runtime budgets, AI providers, and connectors.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-[var(--rail-line)] pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="rounded-full px-4 py-2 text-sm font-medium transition"
            style={
              tab === t.id
                ? { background: "#14212b", color: "#f3eee6" }
                : {
                    background: "rgba(255,255,255,0.55)",
                    color: "#14212b",
                    border: "1px solid var(--rail-line)",
                  }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "boards" && <BoardsPanel />}
      {tab === "board" && <BoardSettingsPanel onGoTab={setTab} />}
      {tab === "providers" && <ProvidersApp embedded />}
      {tab === "connectors" && <ConnectorsApp embedded />}
    </Shell>
  );
}

function BoardSettingsPanel({ onGoTab }: { onGoTab: (tab: TabId) => void }) {
  const [settings, setSettings] = useState<BoardSettings | null>(null);
  const [runtimes, setRuntimes] = useState<{ id: string; name: string }[]>([]);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadModels = useCallback(async (runtime: string, currentModel: string) => {
    setModelsLoading(true);
    try {
      const res = await fetch(
        `/api/providers/models?runtime=${encodeURIComponent(runtime)}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { models: { id: string; name: string }[] };
      const list = json.models ?? [];
      setModels(list);
      return list.some((m) => m.id === currentModel)
        ? currentModel
        : list[0]?.id ?? currentModel;
    } catch {
      setModels([]);
      return currentModel;
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/providers/models?runtimes=1").then((r) => r.json()),
    ])
      .then(async ([s, r]) => {
        const settings = s as BoardSettings;
        setRuntimes((r as { runtimes: { id: string; name: string }[] }).runtimes ?? []);
        const nextModel = await loadModels(settings.defaultRuntime, settings.defaultModel);
        setSettings({ ...settings, defaultModel: nextModel });
      })
      .catch((e) => setError(String(e)));
  }, [loadModels]);

  async function onRuntimeChange(runtime: string) {
    if (!settings) return;
    const nextModel = await loadModels(runtime, settings.defaultModel);
    setSettings({ ...settings, defaultRuntime: runtime, defaultModel: nextModel });
  }

  async function save() {
    if (!settings) return;
    setError(null);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setSettings(await res.json());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (!settings) {
    return <p className="text-sm opacity-70">Loading board settings…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <p className="mb-6 text-sm opacity-60">
        Global runtime, budgets, and spawn gates. Repo paths live on each{" "}
        <button type="button" className="underline" onClick={() => onGoTab("boards")}>
          Board
        </button>
        . Default provider uses the{" "}
        <button type="button" className="underline" onClick={() => onGoTab("providers")}>
          Providers
        </button>{" "}
        tab.
      </p>

      <div className="space-y-5 rounded-2xl border border-[var(--rail-line)] bg-white/55 p-5 backdrop-blur-sm">
        <Field label="Default provider / runtime">
          <select
            className="field"
            value={settings.defaultRuntime}
            onChange={(e) => onRuntimeChange(e.target.value)}
          >
            {runtimes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
            {!runtimes.some((r) => r.id === settings.defaultRuntime) && (
              <option value={settings.defaultRuntime}>{settings.defaultRuntime}</option>
            )}
          </select>
        </Field>
        <Field label={`Default model${modelsLoading ? " (loading…)" : ""}`}>
          {models.length > 0 ? (
            <select
              className="field"
              value={settings.defaultModel}
              onChange={(e) => setSettings({ ...settings, defaultModel: e.target.value })}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="field"
              value={settings.defaultModel}
              placeholder="No models found — type an id"
              onChange={(e) => setSettings({ ...settings, defaultModel: e.target.value })}
            />
          )}
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            label="Auto-advance"
            checked={settings.autoAdvance}
            onChange={(v) => setSettings({ ...settings, autoAdvance: v })}
          />
          <Toggle
            label="Parallel runs"
            checked={settings.parallelRuns}
            onChange={(v) => setSettings({ ...settings, parallelRuns: v })}
          />
          <Toggle
            label="Autonomous (YOLO)"
            checked={settings.autonomous}
            onChange={(v) => setSettings({ ...settings, autonomous: v })}
          />
          <Toggle
            label="Demo mode"
            checked={settings.demoMode}
            onChange={(v) => setSettings({ ...settings, demoMode: v })}
          />
          <Toggle
            label="Write-back on Complete"
            checked={settings.adoWriteBack}
            onChange={(v) => setSettings({ ...settings, adoWriteBack: v })}
          />
          <Toggle
            label="Budget hard-stop"
            checked={settings.budgetHardStop !== false}
            onChange={(v) => setSettings({ ...settings, budgetHardStop: v })}
          />
          <Toggle
            label="Approve required for imports"
            checked={settings.requireApproveForImportedTickets !== false}
            onChange={(v) =>
              setSettings({ ...settings, requireApproveForImportedTickets: v })
            }
          />
          <Toggle
            label="Sub-agents enabled"
            checked={settings.subAgentsEnabled !== false}
            onChange={(v) => setSettings({ ...settings, subAgentsEnabled: v })}
          />
          <Toggle
            label="Sub-agents in parallel"
            checked={settings.subAgentsParallel}
            onChange={(v) => setSettings({ ...settings, subAgentsParallel: v })}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Budget per ticket (USD, 0 = off)">
            <input
              className="field"
              type="number"
              min={0}
              step={0.5}
              value={settings.budgetPerTicketUsd ?? 5}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  budgetPerTicketUsd: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
          </Field>
          <Field label="Budget per day (USD, 0 = off)">
            <input
              className="field"
              type="number"
              min={0}
              step={1}
              value={settings.budgetPerDayUsd ?? 25}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  budgetPerDayUsd: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
          </Field>
        </div>

        <Field label="Max sub-agent depth (0 = off, 1 = stage may spawn)">
          <input
            className="field"
            type="number"
            min={0}
            max={3}
            value={settings.maxSubAgentDepth ?? 1}
            onChange={(e) =>
              setSettings({
                ...settings,
                maxSubAgentDepth: Math.max(0, Math.min(3, Number(e.target.value) || 0)),
              })
            }
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Max per round">
            <input
              className="field"
              type="number"
              min={1}
              max={5}
              value={settings.maxSpawnsPerRound ?? 2}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxSpawnsPerRound: Math.max(1, Math.min(5, Number(e.target.value) || 1)),
                })
              }
            />
          </Field>
          <Field label="Max per stage">
            <input
              className="field"
              type="number"
              min={1}
              max={12}
              value={settings.maxSubAgentsPerStage ?? 4}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxSubAgentsPerStage: Math.max(1, Math.min(12, Number(e.target.value) || 1)),
                })
              }
            />
          </Field>
          <Field label="Max spawn rounds">
            <input
              className="field"
              type="number"
              min={1}
              max={5}
              value={settings.maxSpawnRounds ?? 2}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxSpawnRounds: Math.max(1, Math.min(5, Number(e.target.value) || 1)),
                })
              }
            />
          </Field>
        </div>

        <p className="text-xs opacity-55">
          Only agents with <code>canSpawn: true</code> (e.g. Planner) may spawn. Unknown / self /
          duplicate / over-budget requests are rejected and logged. Last resume round cannot spawn.
        </p>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={save}
            className="rounded-full px-5 py-2.5 text-sm font-medium"
            style={{ background: "#14212b", color: "#f3eee6" }}
          >
            Save settings
          </button>
          {saved && <span className="text-sm text-[var(--rail-steel)]">Saved</span>}
          {error && <span className="text-sm text-[var(--rail-signal)]">{error}</span>}
        </div>
      </div>
      <style jsx global>{`
        .field {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--rail-line);
          background: rgba(255, 255, 255, 0.7);
          padding: 0.65rem 0.85rem;
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}

function BoardsPanel() {
  const [boards, setBoards] = useState<BoardDef[]>([]);
  const [activeBoardId, setActiveBoardId] = useState("default");
  const [workstreams, setWorkstreams] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<BoardDef | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    id: "",
    name: "",
    color: "#3d5a80",
    repoPath: "",
    baseRef: "main",
    worktreeRoot: "",
    branchPrefix: "agent/",
    workstreamIds: [] as string[],
    activeWorkstreamId: "feature",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [bRes, wRes] = await Promise.all([
      fetch("/api/boards", { cache: "no-store" }),
      fetch("/api/workstreams", { cache: "no-store" }),
    ]);
    const bJson = (await bRes.json()) as {
      boards: BoardDef[];
      activeBoardId: string;
    };
    const wJson = (await wRes.json()) as {
      workstreams: { id: string; name: string }[];
    };
    setBoards(bJson.boards || []);
    setActiveBoardId(bJson.activeBoardId || "default");
    setWorkstreams(
      (wJson.workstreams || []).map((w) => ({ id: w.id, name: w.name })),
    );
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, [refresh]);

  function startCreate() {
    setCreating(true);
    setEditing(null);
    setDraft({
      id: "",
      name: "",
      color: "#c45c26",
      repoPath: "",
      baseRef: "main",
      worktreeRoot: "",
      branchPrefix: "agent/",
      workstreamIds: workstreams.filter((w) => w.id !== "demo-job").map((w) => w.id),
      activeWorkstreamId: workstreams.find((w) => w.id === "feature")?.id || workstreams[0]?.id || "feature",
    });
    setError(null);
  }

  function startEdit(b: BoardDef) {
    setCreating(false);
    setEditing(b);
    setDraft({
      id: b.id,
      name: b.name,
      color: b.color,
      repoPath: b.repoPath || "",
      baseRef: b.baseRef || "main",
      worktreeRoot: b.worktreeRoot || "",
      branchPrefix: b.branchPrefix || "agent/",
      workstreamIds: [...(b.workstreamIds || [])],
      activeWorkstreamId: b.activeWorkstreamId || "feature",
    });
    setError(null);
  }

  function toggleWs(id: string) {
    setDraft((d) => {
      const has = d.workstreamIds.includes(id);
      const workstreamIds = has
        ? d.workstreamIds.filter((x) => x !== id)
        : [...d.workstreamIds, id];
      const activeWorkstreamId = workstreamIds.includes(d.activeWorkstreamId)
        ? d.activeWorkstreamId
        : workstreamIds[0] || "feature";
      return { ...d, workstreamIds, activeWorkstreamId };
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: creating ? "create" : "update",
          id: draft.id,
          name: draft.name,
          color: draft.color,
          repoPath: draft.repoPath,
          baseRef: draft.baseRef,
          worktreeRoot: draft.worktreeRoot || undefined,
          branchPrefix: draft.branchPrefix || undefined,
          workstreamIds: draft.workstreamIds,
          activeWorkstreamId: draft.activeWorkstreamId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setCreating(false);
      setEditing(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function activate(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Activate failed");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (boards.length <= 1) {
      setError("Cannot delete the last board");
      return;
    }
    if (!confirm(`Delete board "${id}"? Its tickets will move to another board.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
      if (editing?.id === id) setEditing(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const showForm = creating || editing;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <p className="text-sm opacity-60">
        Each board is a named workspace with its own git repo and selected workstreams. Tickets stay
        isolated per board — switch boards on the kanban to work Web vs Mobile separately.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={startCreate}
          disabled={busy}
          className="rounded-full px-4 py-2 text-sm font-medium"
          style={{ background: "#14212b", color: "#f3eee6" }}
        >
          New board
        </button>
        {error && <span className="self-center text-sm text-[var(--rail-signal)]">{error}</span>}
      </div>

      <div className="space-y-3">
        {boards.map((b) => (
          <div
            key={b.id}
            className="rounded-2xl border border-[var(--rail-line)] bg-white/55 p-4 backdrop-blur-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ background: b.color }}
                  />
                  <span className="font-semibold">{b.name}</span>
                  <span className="text-xs opacity-50" style={{ fontFamily: "var(--font-mono)" }}>
                    {b.id}
                  </span>
                  {b.id === activeBoardId && (
                    <span className="rounded-full bg-[var(--rail-steel)]/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                      Active
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs opacity-60" style={{ fontFamily: "var(--font-mono)" }}>
                  {b.repoPath || "(sandbox)"} · {b.baseRef} · {b.workstreamIds.length} streams
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {b.id !== activeBoardId && (
                  <button
                    type="button"
                    className="rounded-full border border-[var(--rail-line)] px-3 py-1 text-xs font-medium"
                    disabled={busy}
                    onClick={() => activate(b.id)}
                  >
                    Activate
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-full border border-[var(--rail-line)] px-3 py-1 text-xs font-medium"
                  disabled={busy}
                  onClick={() => startEdit(b)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[var(--rail-line)] px-3 py-1 text-xs font-medium text-[var(--rail-signal)]"
                  disabled={busy || boards.length <= 1}
                  onClick={() => remove(b.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="space-y-4 rounded-2xl border border-[var(--rail-line)] bg-white/70 p-5">
          <h3 className="text-lg font-semibold">{creating ? "Create board" : `Edit ${editing?.name}`}</h3>
          {creating && (
            <Field label="Id (slug)">
              <input
                className="field"
                value={draft.id}
                placeholder="bloodbike-web"
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
              />
            </Field>
          )}
          <Field label="Name">
            <input
              className="field"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="Repo path (absolute)">
            <input
              className="field"
              value={draft.repoPath}
              placeholder="/Users/you/Documents/Gitea/BloodBike/Web"
              onChange={(e) => setDraft({ ...draft, repoPath: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Base branch">
              <input
                className="field"
                value={draft.baseRef}
                onChange={(e) => setDraft({ ...draft, baseRef: e.target.value })}
              />
            </Field>
            <Field label="Color">
              <input
                className="field"
                type="color"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              />
            </Field>
            <Field label="Branch prefix">
              <input
                className="field"
                value={draft.branchPrefix}
                onChange={(e) => setDraft({ ...draft, branchPrefix: e.target.value })}
              />
            </Field>
            <Field label="Worktree root (optional)">
              <input
                className="field"
                value={draft.worktreeRoot}
                placeholder=".worktrees"
                onChange={(e) => setDraft({ ...draft, worktreeRoot: e.target.value })}
              />
            </Field>
          </div>
          <div>
            <span className="mb-2 block text-xs font-medium tracking-wide uppercase opacity-55">
              Workstreams on this board
            </span>
            <div className="flex flex-wrap gap-2">
              {workstreams.map((w) => {
                const on = draft.workstreamIds.includes(w.id);
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => toggleWs(w.id)}
                    className="rounded-full px-3 py-1.5 text-xs font-medium"
                    style={
                      on
                        ? { background: "#14212b", color: "#f3eee6" }
                        : {
                            background: "rgba(255,255,255,0.6)",
                            border: "1px solid var(--rail-line)",
                          }
                    }
                  >
                    {w.name}
                  </button>
                );
              })}
            </div>
          </div>
          <Field label="Default workstream">
            <select
              className="field"
              value={draft.activeWorkstreamId}
              onChange={(e) => setDraft({ ...draft, activeWorkstreamId: e.target.value })}
            >
              {draft.workstreamIds.map((id) => (
                <option key={id} value={id}>
                  {workstreams.find((w) => w.id === id)?.name || id}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={save}
              disabled={busy || !draft.name.trim()}
              className="rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-50"
              style={{ background: "#14212b", color: "#f3eee6" }}
            >
              {creating ? "Create" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
              className="rounded-full border border-[var(--rail-line)] px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        .field {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--rail-line);
          background: rgba(255, 255, 255, 0.7);
          padding: 0.65rem 0.85rem;
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium tracking-wide uppercase opacity-55">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--rail-line)] bg-white/50 px-3 py-2.5">
      <span className="text-sm font-medium">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
