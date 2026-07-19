"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { BoardSettings } from "@/lib/types";
import { Shell } from "./Shell";
import { ProvidersApp } from "./ProvidersApp";
import { ConnectorsApp } from "./ConnectorsApp";

type TabId = "board" | "providers" | "connectors";

const TABS: { id: TabId; label: string }[] = [
  { id: "board", label: "Board" },
  { id: "providers", label: "Providers" },
  { id: "connectors", label: "Connectors" },
];

function parseTab(raw: string | null): TabId {
  if (raw === "providers" || raw === "connectors" || raw === "board") return raw;
  return "board";
}

export function SettingsApp() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = useMemo(() => parseTab(searchParams.get("tab")), [searchParams]);

  function setTab(next: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "board") params.delete("tab");
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
          Board behaviour, AI providers, and ticket connectors in one place.
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
        Default provider uses the{" "}
        <button type="button" className="underline" onClick={() => onGoTab("providers")}>
          Providers
        </button>{" "}
        tab. Changing it refreshes the model list. Saving syncs the model onto that provider.
      </p>

      <div className="space-y-5 rounded-2xl border border-[var(--rail-line)] bg-white/55 p-5 backdrop-blur-sm">
        <Field label="Repo path">
          <input
            className="field"
            value={settings.repoPath}
            placeholder="Leave empty to use demo sandbox repo"
            onChange={(e) => setSettings({ ...settings, repoPath: e.target.value })}
          />
        </Field>
        <Field label="Base branch">
          <input
            className="field"
            value={settings.baseRef}
            onChange={(e) => setSettings({ ...settings, baseRef: e.target.value })}
          />
        </Field>
        <Field label="Worktree root">
          <input
            className="field"
            value={settings.worktreeRoot}
            onChange={(e) => setSettings({ ...settings, worktreeRoot: e.target.value })}
          />
        </Field>
        <Field label="Branch prefix">
          <input
            className="field"
            value={settings.branchPrefix}
            onChange={(e) => setSettings({ ...settings, branchPrefix: e.target.value })}
          />
        </Field>

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
