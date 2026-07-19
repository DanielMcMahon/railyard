"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AgentDef,
  CompleteAction,
  StageDef,
  WorkstreamDef,
  WorkstreamKind,
} from "@/lib/types";
import { Shell } from "./Shell";
import { WorkflowFlowDiagram } from "./WorkflowFlowDiagram";

type Draft = {
  originalId: string | null;
  id: string;
  name: string;
  kind: WorkstreamKind;
  color: string;
  stages: StageDef[];
  git: boolean;
  completeAction: CompleteAction;
  defaultLabels: string;
  cronExpression: string;
  defaultOnFailureAgentId: string;
  onRequestChangesAgentId: string;
  notes: string;
};

const emptyDraft = (): Draft => ({
  originalId: null,
  id: "",
  name: "",
  kind: "pipeline",
  color: "#3d5a80",
  stages: [],
  git: true,
  completeAction: "commit_and_pr",
  defaultLabels: "",
  cronExpression: "",
  defaultOnFailureAgentId: "",
  onRequestChangesAgentId: "",
  notes: "",
});

function stageLabel(s: StageDef): string {
  if (s.kind === "command") return `⌘ ${s.title} (${s.argv.join(" ")})`;
  if (s.kind === "validator") return `✓ ${s.title} (${s.validator})`;
  const bits = [s.agentId];
  if (s.onFailureAgentId) bits.push(`fail→${s.onFailureAgentId}`);
  if (s.onSuccess && s.onSuccess !== "next") bits.push(`ok→${s.onSuccess}`);
  return bits.join(" ");
}

function stageKey(s: StageDef): string {
  if (s.kind === "agent") return s.agentId;
  if (s.kind === "validator") return `validator:${s.id}`;
  return `command:${s.id}`;
}

function patchStage(stages: StageDef[], key: string, patch: Partial<StageDef>): StageDef[] {
  return stages.map((s) => {
    if (stageKey(s) !== key) return s;
    return { ...s, ...patch } as StageDef;
  });
}

export function WorkstreamsApp() {
  const [streams, setStreams] = useState<WorkstreamDef[]>([]);
  const [agents, setAgents] = useState<Omit<AgentDef, "prompt">[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [wsRes, agRes] = await Promise.all([
      fetch("/api/workstreams", { cache: "no-store" }),
      fetch("/api/agents", { cache: "no-store" }),
    ]);
    const wsJson = (await wsRes.json()) as { workstreams: WorkstreamDef[] };
    const agJson = (await agRes.json()) as { agents: AgentDef[] };
    setStreams(wsJson.workstreams || []);
    setAgents((agJson.agents || []).map(({ prompt: _p, ...a }) => a));
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, [refresh]);

  function startCreate() {
    setError(null);
    setDraft(emptyDraft());
  }

  function startEdit(ws: WorkstreamDef) {
    setError(null);
    setDraft({
      originalId: ws.id,
      id: ws.id,
      name: ws.name,
      kind: ws.kind,
      color: ws.color,
      stages: [...ws.stages],
      git: ws.git,
      completeAction: ws.completeAction,
      defaultLabels: (ws.defaultLabels || []).join(", "),
      cronExpression:
        ws.trigger?.type === "cron" ? ws.trigger.expression : "",
      defaultOnFailureAgentId: ws.defaultOnFailureAgentId || "",
      onRequestChangesAgentId: ws.onRequestChangesAgentId || "",
      notes: ws.notes || "",
    });
  }

  function toggleStage(agentId: string) {
    if (!draft) return;
    const has = draft.stages.some((s) => s.kind === "agent" && s.agentId === agentId);
    if (has) {
      setDraft({
        ...draft,
        stages: draft.stages.filter((s) => !(s.kind === "agent" && s.agentId === agentId)),
      });
    } else {
      setDraft({ ...draft, stages: [...draft.stages, { kind: "agent", agentId }] });
    }
  }

  function moveStage(key: string, dir: -1 | 1) {
    if (!draft) return;
    const idx = draft.stages.findIndex((s) => stageKey(s) === key);
    if (idx < 0) return;
    const next = [...draft.stages];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    setDraft({ ...draft, stages: next });
  }

  function addDotnetVerify() {
    if (!draft) return;
    if (draft.stages.some((s) => s.kind === "command" && s.id === "verify-dotnet")) return;
    setDraft({
      ...draft,
      stages: [
        ...draft.stages,
        {
          kind: "command",
          id: "verify-dotnet",
          title: "dotnet verify",
          argv: ["dotnet", "test", "--no-restore", "-v", "q"],
        },
      ],
    });
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        action: draft.originalId ? "update" : "create",
        id: draft.originalId || draft.id,
        nextId: draft.id,
        name: draft.name,
        kind: draft.kind,
        color: draft.color,
        stages: draft.stages,
        git: draft.git,
        completeAction: draft.completeAction,
        defaultLabels: draft.defaultLabels
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        trigger:
          draft.kind === "job" && draft.cronExpression.trim()
            ? { type: "cron", expression: draft.cronExpression.trim() }
            : null,
        defaultOnFailureAgentId: draft.defaultOnFailureAgentId.trim() || null,
        onRequestChangesAgentId: draft.onRequestChangesAgentId.trim() || null,
        notes: draft.notes,
      };
      const res = await fetch("/api/workstreams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setStreams(json.workstreams || []);
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
    if (!confirm(`Delete workstream "${id}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workstreams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
      setStreams(json.workstreams || []);
      if (draft?.originalId === id) setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={startCreate}
          className="rounded-full px-4 py-2 text-sm font-medium"
          style={{ background: "#14212b", color: "#f3eee6" }}
        >
          New workstream
        </button>
        {saved && <span className="text-xs text-[var(--rail-teal,#2f6f5e)]">Saved</span>}
        {error && <span className="text-xs text-[var(--rail-signal)]">{error}</span>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">Streams</h2>
          {streams.map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => startEdit(ws)}
              className="flex w-full items-start gap-3 rounded-xl border border-[var(--rail-line)] bg-white/60 px-4 py-3 text-left hover:bg-white"
            >
              <span
                className="mt-1 h-3 w-3 shrink-0 rounded-full"
                style={{ background: ws.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{ws.name}</div>
                <div className="mb-2 text-xs opacity-60" style={{ fontFamily: "var(--font-mono)" }}>
                  {ws.id} · {ws.kind}
                  {" · "}
                  {ws.git ? "git" : "no-git"} · {ws.completeAction}
                </div>
                <WorkflowFlowDiagram
                  workstream={ws}
                  accent={ws.color}
                  compact
                  agentNames={Object.fromEntries(agents.map((a) => [a.id, a.name]))}
                  className="pointer-events-none"
                />
              </div>
            </button>
          ))}
          {streams.length === 0 && (
            <p className="text-sm opacity-60">No workstreams yet. Create one or re-seed.</p>
          )}
        </div>

        {draft && (
          <div className="space-y-3 rounded-xl border border-[var(--rail-line)] bg-white/70 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
              {draft.originalId ? "Edit" : "Create"}
            </h2>
            <Field label="Id">
              <input
                className="w-full rounded-lg border border-[var(--rail-line)] px-3 py-2 text-sm"
                value={draft.id}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                disabled={Boolean(draft.originalId)}
              />
            </Field>
            <Field label="Name">
              <input
                className="w-full rounded-lg border border-[var(--rail-line)] px-3 py-2 text-sm"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kind">
                <select
                  className="w-full rounded-lg border border-[var(--rail-line)] px-3 py-2 text-sm"
                  value={draft.kind}
                  onChange={(e) =>
                    setDraft({ ...draft, kind: e.target.value as WorkstreamKind })
                  }
                >
                  <option value="pipeline">pipeline</option>
                  <option value="job">job</option>
                </select>
              </Field>
              <Field label="Color">
                <input
                  type="color"
                  className="h-10 w-full rounded-lg border border-[var(--rail-line)]"
                  value={draft.color}
                  onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Complete action">
              <select
                className="w-full rounded-lg border border-[var(--rail-line)] px-3 py-2 text-sm"
                value={draft.completeAction}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    completeAction: e.target.value as CompleteAction,
                  })
                }
              >
                <option value="commit_and_pr">commit_and_pr</option>
                <option value="note_only">note_only</option>
                <option value="connector_reply">connector_reply (stub)</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.git}
                onChange={(e) => setDraft({ ...draft, git: e.target.checked })}
              />
              Use git worktree
            </label>
            <Field label="Default labels (comma-separated)">
              <input
                className="w-full rounded-lg border border-[var(--rail-line)] px-3 py-2 text-sm"
                value={draft.defaultLabels}
                onChange={(e) => setDraft({ ...draft, defaultLabels: e.target.value })}
              />
            </Field>
            {draft.kind === "job" && (
              <Field label="Cron (e.g. */15 * * * *)">
                <input
                  className="w-full rounded-lg border border-[var(--rail-line)] px-3 py-2 text-sm"
                  value={draft.cronExpression}
                  onChange={(e) => setDraft({ ...draft, cronExpression: e.target.value })}
                  placeholder="*/15 * * * *"
                />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="On request-changes → agent">
                <select
                  className="w-full rounded-lg border border-[var(--rail-line)] px-3 py-2 text-sm"
                  value={draft.onRequestChangesAgentId}
                  onChange={(e) =>
                    setDraft({ ...draft, onRequestChangesAgentId: e.target.value })
                  }
                >
                  <option value="">(last stage / Needs human)</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Default on failure → agent">
                <select
                  className="w-full rounded-lg border border-[var(--rail-line)] px-3 py-2 text-sm"
                  value={draft.defaultOnFailureAgentId}
                  onChange={(e) =>
                    setDraft({ ...draft, defaultOnFailureAgentId: e.target.value })
                  }
                >
                  <option value="">Needs human</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wide opacity-55">
                Flow (live from stages + routing)
              </p>
              <WorkflowFlowDiagram
                workstream={{
                  id: draft.id || "draft",
                  name: draft.name || "Draft",
                  stages: draft.stages,
                  defaultOnFailureAgentId: draft.defaultOnFailureAgentId || null,
                  onRequestChangesAgentId: draft.onRequestChangesAgentId || null,
                }}
                accent={draft.color}
                agentNames={Object.fromEntries(agents.map((a) => [a.id, a.name]))}
              />
            </div>

            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wide opacity-55">
                Stages (agents + command / validator gates)
              </p>
              <div className="mb-2 space-y-2">
                {draft.stages.map((stage) => {
                  const key = stageKey(stage);
                  const agent =
                    stage.kind === "agent"
                      ? agents.find((a) => a.id === stage.agentId)
                      : null;
                  const failVal =
                    stage.onFailureAgentId === null
                      ? "needs_human"
                      : stage.onFailureAgentId || "";
                  const okVal = stage.onSuccess || "next";
                  return (
                    <div
                      key={key}
                      className="space-y-1.5 rounded-lg border border-[var(--rail-line)] bg-white/80 px-2 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex-1 font-medium">
                          {stage.kind === "agent"
                            ? agent?.name || stage.agentId
                            : stageLabel(stage)}
                        </span>
                        <button
                          type="button"
                          className="rounded px-1.5 text-xs opacity-60 hover:opacity-100"
                          onClick={() => moveStage(key, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="rounded px-1.5 text-xs opacity-60 hover:opacity-100"
                          onClick={() => moveStage(key, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="rounded px-1.5 text-xs text-[var(--rail-signal)]"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              stages: draft.stages.filter((s) => stageKey(s) !== key),
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block space-y-0.5">
                          <span className="text-[9px] uppercase tracking-wide opacity-50">
                            On failure
                          </span>
                          <select
                            className="w-full rounded border border-[var(--rail-line)] px-1.5 py-1 text-xs"
                            value={failVal}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDraft({
                                ...draft,
                                stages: patchStage(draft.stages, key, {
                                  onFailureAgentId:
                                    v === ""
                                      ? undefined
                                      : v === "needs_human"
                                        ? null
                                        : v,
                                }),
                              });
                            }}
                          >
                            <option value="">(stream default)</option>
                            <option value="needs_human">Needs human</option>
                            {agents.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-0.5">
                          <span className="text-[9px] uppercase tracking-wide opacity-50">
                            On success
                          </span>
                          <select
                            className="w-full rounded border border-[var(--rail-line)] px-1.5 py-1 text-xs"
                            value={okVal}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDraft({
                                ...draft,
                                stages: patchStage(draft.stages, key, {
                                  onSuccess: v === "next" ? undefined : v,
                                }),
                              });
                            }}
                          >
                            <option value="next">Next stage</option>
                            <option value="review">Review (human)</option>
                            <option value="needs_human">Needs human</option>
                            {agents.map((a) => (
                              <option key={a.id} value={a.id}>
                                Jump → {a.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mb-1 text-[10px] uppercase tracking-wide opacity-50">Add from library</p>
              <div className="flex flex-wrap gap-1.5">
                {agents
                  .filter(
                    (a) =>
                      !draft.stages.some((s) => s.kind === "agent" && s.agentId === a.id),
                  )
                  .map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleStage(a.id)}
                      className="rounded-full px-2.5 py-1 text-xs font-medium text-white"
                      style={{ background: a.color }}
                    >
                      + {a.name}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={addDotnetVerify}
                  className="rounded-full border border-[var(--rail-line)] px-2.5 py-1 text-xs font-medium"
                >
                  + dotnet verify
                </button>
              </div>
            </div>

            <Field label="Notes">
              <textarea
                className="min-h-[80px] w-full rounded-lg border border-[var(--rail-line)] px-3 py-2 text-sm"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </Field>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={save}
                className="rounded-full px-4 py-2 text-sm font-medium"
                style={{ background: "#14212b", color: "#f3eee6" }}
              >
                Save
              </button>
              <button
                type="button"
                className="rounded-full border border-[var(--rail-line)] px-4 py-2 text-sm"
                onClick={() => setDraft(null)}
              >
                Cancel
              </button>
              {draft.originalId && draft.originalId !== "feature" && (
                <button
                  type="button"
                  className="ml-auto rounded-full px-4 py-2 text-sm text-[var(--rail-signal)]"
                  onClick={() => remove(draft.originalId!)}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-medium uppercase tracking-wide opacity-55">{label}</span>
      {children}
    </label>
  );
}
