"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentDef, RuntimeKind } from "@/lib/types";
import { Shell } from "./Shell";

type Draft = {
  originalId: string | null;
  id: string;
  name: string;
  runtime: RuntimeKind;
  model: string;
  autonomous: boolean;
  canSpawn: boolean;
  color: string;
  prompt: string;
};

type ModelOption = { id: string; name: string };
type RuntimeOption = { id: string; name: string };

const emptyDraft = (): Draft => ({
  originalId: null,
  id: "",
  name: "",
  runtime: "cursor",
  model: "composer-2.5",
  autonomous: true,
  canSpawn: false,
  color: "#2f6f5e",
  prompt:
    "You are an agent on this board.\n\nRead the ticket. Do the work. When finished, say DONE.\n",
});

export function AgentsApp() {
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [runtimes, setRuntimes] = useState<RuntimeOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/agents", { cache: "no-store" });
    const json = (await res.json()) as { agents: AgentDef[] };
    setAgents(json.agents);
  }, []);

  const loadModels = useCallback(async (runtime: string, currentModel: string) => {
    const res = await fetch(
      `/api/providers/models?runtime=${encodeURIComponent(runtime)}`,
      { cache: "no-store" },
    );
    const json = (await res.json()) as { models: ModelOption[] };
    const list = json.models ?? [];
    setModels(list);
    return list.some((m) => m.id === currentModel) ? currentModel : list[0]?.id ?? currentModel;
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
    fetch("/api/providers/models?runtimes=1")
      .then((r) => r.json())
      .then((j) => setRuntimes(j.runtimes ?? []))
      .catch(() => undefined);
  }, [refresh]);

  function startCreate() {
    setError(null);
    const d = emptyDraft();
    setDraft(d);
    loadModels(d.runtime, d.model).then((model) => setDraft({ ...d, model }));
  }

  function startEdit(agent: AgentDef) {
    setError(null);
    const d: Draft = {
      originalId: agent.id,
      id: agent.id,
      name: agent.name,
      runtime: agent.runtime,
      model: agent.model,
      autonomous: agent.autonomous,
      canSpawn: agent.canSpawn === true,
      color: agent.color,
      prompt: agent.prompt,
    };
    setDraft(d);
    loadModels(d.runtime, d.model).then((model) => setDraft({ ...d, model }));
  }

  async function onRuntimeChange(runtime: RuntimeKind) {
    if (!draft) return;
    const nextModel = await loadModels(runtime, draft.model);
    setDraft({ ...draft, runtime, model: nextModel });
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const isNew = !draft.originalId;
      const res = await fetch("/api/agents", {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isNew
            ? draft
            : {
                originalId: draft.originalId,
                id: draft.id,
                name: draft.name,
                runtime: draft.runtime,
                model: draft.model,
                autonomous: draft.autonomous,
                canSpawn: draft.canSpawn,
                color: draft.color,
                prompt: draft.prompt,
              },
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setAgents(json.agents);
      setDraft(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(`Delete agent "${id}"? Columns using it will be removed (tickets → Inbox).`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
      setAgents(json.agents);
      if (draft?.originalId === id) setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 lg:flex-row">
        <div className="w-full shrink-0 lg:w-[320px]">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2
              className="text-3xl font-bold"
              style={{ fontFamily: "var(--font-syne, var(--font-display))" }}
            >
              Agents
            </h2>
            <button
              type="button"
              onClick={startCreate}
              className="rounded-full px-4 py-2 text-sm font-medium"
              style={{ background: "#14212b", color: "#f3eee6" }}
            >
              New agent
            </button>
          </div>
          <p className="mb-4 text-sm opacity-60">
            Prompts live in <code className="text-xs">agents/*.md</code>. Edit here or on disk.
          </p>
          <ul className="space-y-2">
            {agents.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => startEdit(a)}
                  className="flex w-full items-center gap-3 rounded-xl border border-[var(--rail-line)] bg-white/55 px-3 py-3 text-left hover:bg-white/80"
                  style={{
                    outline: draft?.originalId === a.id ? `2px solid ${a.color}` : undefined,
                  }}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: a.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{a.name}</span>
                    <span
                      className="block truncate text-[11px] opacity-50"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {a.id} · {a.runtime} · {a.model}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {agents.length === 0 && (
              <li className="rounded-xl border border-dashed border-[var(--rail-line)] px-3 py-8 text-center text-sm opacity-50">
                No agents yet
              </li>
            )}
          </ul>
          {saved && <p className="mt-3 text-sm opacity-60">Saved</p>}
          {error && <p className="mt-3 text-sm text-[var(--rail-signal)]">{error}</p>}
        </div>

        <div className="min-w-0 flex-1">
          {draft ? (
            <div className="rounded-2xl border border-[var(--rail-line)] bg-white/55 p-5 backdrop-blur-sm">
              <h3
                className="mb-4 text-xl font-bold"
                style={{ fontFamily: "var(--font-syne, var(--font-display))" }}
              >
                {draft.originalId ? `Edit ${draft.name}` : "New agent"}
              </h3>
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Id (filename)">
                    <input
                      className="ry-field"
                      value={draft.id}
                      disabled={Boolean(draft.originalId)}
                      placeholder="e.g. api-reviewer"
                      onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                    />
                  </Field>
                  <Field label="Display name">
                    <input
                      className="ry-field"
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  </Field>
                  <Field label="Runtime / provider">
                    <select
                      className="ry-field"
                      value={draft.runtime}
                      onChange={(e) => onRuntimeChange(e.target.value as RuntimeKind)}
                    >
                      {(runtimes.length
                        ? runtimes
                        : [
                            { id: "cursor", name: "cursor" },
                            { id: "opencode", name: "opencode" },
                            { id: "copilot", name: "copilot" },
                            { id: "demo", name: "demo" },
                          ]
                      ).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Model">
                    {models.length > 0 ? (
                      <select
                        className="ry-field"
                        value={draft.model}
                        onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                      >
                        {models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="ry-field"
                        value={draft.model}
                        onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Color">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={draft.color}
                        onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                        className="h-10 w-12 cursor-pointer rounded border border-[var(--rail-line)] bg-white"
                      />
                      <input
                        className="ry-field"
                        value={draft.color}
                        onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                      />
                    </div>
                  </Field>
                  <label className="flex cursor-pointer items-end gap-2 pb-2">
                    <input
                      type="checkbox"
                      checked={draft.autonomous}
                      onChange={(e) => setDraft({ ...draft, autonomous: e.target.checked })}
                    />
                    <span className="text-sm font-medium">Autonomous</span>
                  </label>
                  <label className="flex cursor-pointer items-end gap-2 pb-2">
                    <input
                      type="checkbox"
                      checked={draft.canSpawn}
                      onChange={(e) => setDraft({ ...draft, canSpawn: e.target.checked })}
                    />
                    <span className="text-sm font-medium">Can spawn sub-agents</span>
                  </label>
                </div>
                <Field label="Prompt">
                  <textarea
                    className="ry-field min-h-[280px] font-mono text-[13px] leading-relaxed"
                    value={draft.prompt}
                    onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
                    spellCheck={false}
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={save}
                    className="rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-50"
                    style={{ background: "#14212b", color: "#f3eee6" }}
                  >
                    {draft.originalId ? "Save agent" : "Create agent"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft(null)}
                    className="rounded-full border border-[var(--rail-line)] bg-white/70 px-4 py-2.5 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  {draft.originalId && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(draft.originalId!)}
                      className="ml-auto rounded-full px-4 py-2.5 text-sm font-medium text-[#c45c26]"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-[var(--rail-line)] bg-white/30 px-6 text-center text-sm opacity-55">
              Select an agent to edit its prompt, or create a new one.
            </div>
          )}
        </div>
      </div>
      <style jsx global>{`
        .ry-field {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--rail-line);
          background: rgba(255, 255, 255, 0.7);
          padding: 0.65rem 0.85rem;
          font-size: 0.9rem;
        }
        .ry-field:disabled {
          opacity: 0.6;
        }
      `}</style>
    </Shell>
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
