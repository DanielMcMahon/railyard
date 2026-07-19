"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConnectorPublic } from "@/lib/types";
import { Shell } from "./Shell";

type Draft = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  baseUrl: string;
  configText: string;
  notes: string;
  apiKeyInput: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
  isCustom: boolean;
};

const BUILTIN = new Set(["ado", "trello", "github", "linear"]);

export function ConnectorsApp({ embedded = false }: { embedded?: boolean }) {
  const [connectors, setConnectors] = useState<ConnectorPublic[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/connectors", { cache: "no-store" });
    const json = (await res.json()) as { connectors: ConnectorPublic[] };
    setConnectors(json.connectors);
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, [refresh]);

  function openEdit(c: ConnectorPublic) {
    setCreating(false);
    setError(null);
    setDraft({
      id: c.id,
      name: c.name,
      kind: c.kind,
      enabled: c.enabled,
      baseUrl: c.baseUrl,
      configText: JSON.stringify(c.config || {}, null, 2),
      notes: c.notes || "",
      apiKeyInput: "",
      hasApiKey: c.hasApiKey,
      apiKeyMasked: c.apiKeyMasked,
      isCustom: !BUILTIN.has(c.id),
    });
  }

  function startCreate() {
    setCreating(true);
    setError(null);
    setDraft({
      id: "",
      name: "",
      kind: "custom",
      enabled: true,
      baseUrl: "https://",
      configText: "{\n  \n}",
      notes: "",
      apiKeyInput: "",
      hasApiKey: false,
      apiKeyMasked: "",
      isCustom: true,
    });
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      let config: Record<string, string> = {};
      try {
        config = JSON.parse(draft.configText || "{}");
      } catch {
        throw new Error("Config must be valid JSON");
      }
      if (creating) {
        const res = await fetch("/api/connectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            id: draft.id,
            name: draft.name,
            kind: draft.kind,
            baseUrl: draft.baseUrl,
            config,
            apiKey: draft.apiKeyInput,
            notes: draft.notes,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Create failed");
        setConnectors(json.connectors);
        setDraft(null);
        setCreating(false);
      } else {
        const res = await fetch("/api/connectors", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: draft.id,
            name: draft.name,
            enabled: draft.enabled,
            baseUrl: draft.baseUrl,
            config,
            notes: draft.notes,
            apiKey: draft.apiKeyInput || undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Save failed");
        setConnectors(json.connectors);
        openEdit(json.connectors.find((c: ConnectorPublic) => c.id === draft.id));
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function clearKey() {
    if (!draft || creating) return;
    setBusy(true);
    try {
      const res = await fetch("/api/connectors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id, clearApiKey: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Clear failed");
      setConnectors(json.connectors);
      openEdit(json.connectors.find((c: ConnectorPublic) => c.id === draft.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.isCustom) return;
    if (!confirm(`Delete connector "${draft.id}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/connectors?id=${encodeURIComponent(draft.id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
      setConnectors(json.connectors);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const body = (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 lg:flex-row">
        <div className="w-full shrink-0 lg:w-[300px]">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2
              className={embedded ? "text-xl font-bold" : "text-3xl font-bold"}
              style={{ fontFamily: "var(--font-syne, var(--font-display))" }}
            >
              Connectors
            </h2>
            <button
              type="button"
              onClick={startCreate}
              className="rounded-full px-3 py-2 text-sm font-medium"
              style={{ background: "#14212b", color: "#f3eee6" }}
            >
              Add
            </button>
          </div>
          <p className="mb-4 text-sm opacity-60">
            Optional imports from ADO, Trello, GitHub, Linear, or custom. Tickets always live
            locally — connectors only sync in.
          </p>
          <ul className="space-y-2">
            {connectors.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => openEdit(c)}
                  className="flex w-full items-start gap-3 rounded-xl border border-[var(--rail-line)] bg-white/55 px-3 py-3 text-left hover:bg-white/80"
                  style={{
                    outline: draft?.id === c.id && !creating ? "2px solid #14212b" : undefined,
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{c.name}</span>
                      {!c.enabled && (
                        <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px]">off</span>
                      )}
                    </span>
                    <span
                      className="mt-0.5 block truncate text-[11px] opacity-50"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {c.kind}
                      {c.hasApiKey ? ` · key ${c.apiKeyMasked}` : " · no key"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
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
                {creating ? "New connector" : draft.name}
              </h3>
              <div className="space-y-4">
                {creating && (
                  <Field label="Id">
                    <input
                      className="ry-field"
                      value={draft.id}
                      onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                    />
                  </Field>
                )}
                <Field label="Name">
                  <input
                    className="ry-field"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </Field>
                <Field label="Base URL">
                  <input
                    className="ry-field"
                    value={draft.baseUrl}
                    onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                  />
                </Field>
                <Field
                  label={
                    draft.hasApiKey && !draft.apiKeyInput
                      ? `API key / PAT (saved ${draft.apiKeyMasked})`
                      : "API key / PAT"
                  }
                >
                  <input
                    className="ry-field"
                    type="password"
                    autoComplete="off"
                    value={draft.apiKeyInput}
                    placeholder={draft.hasApiKey ? "Leave blank to keep" : ""}
                    onChange={(e) => setDraft({ ...draft, apiKeyInput: e.target.value })}
                  />
                </Field>
                <Field label="Config (JSON)">
                  <textarea
                    className="ry-field min-h-36 font-mono text-[13px]"
                    value={draft.configText}
                    spellCheck={false}
                    onChange={(e) => setDraft({ ...draft, configText: e.target.value })}
                  />
                </Field>
                <Field label="Notes">
                  <textarea
                    className="ry-field min-h-20"
                    value={draft.notes}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  />
                </Field>
                {!creating && (
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                    />
                    <span className="text-sm font-medium">Enabled</span>
                  </label>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={save}
                    className="rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-50"
                    style={{ background: "#14212b", color: "#f3eee6" }}
                  >
                    {creating ? "Create" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(null);
                      setCreating(false);
                    }}
                    className="rounded-full border border-[var(--rail-line)] bg-white/70 px-4 py-2.5 text-sm"
                  >
                    Cancel
                  </button>
                  {!creating && draft.hasApiKey && (
                    <button type="button" disabled={busy} onClick={clearKey} className="text-sm opacity-70">
                      Clear key
                    </button>
                  )}
                  {draft.isCustom && !creating && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={remove}
                      className="ml-auto text-sm text-[#c45c26]"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-[var(--rail-line)] bg-white/30 px-6 text-center text-sm opacity-55">
              Select a connector to configure credentials. Import wiring comes next — tickets are
              already fully local via New ticket on the board.
            </div>
          )}
        </div>
      </div>
  );

  const styles = (
      <style jsx global>{`
        .ry-field {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--rail-line);
          background: rgba(255, 255, 255, 0.7);
          padding: 0.65rem 0.85rem;
          font-size: 0.9rem;
        }
      `}</style>
  );

  if (embedded) {
    return (
      <>
        {body}
        {styles}
      </>
    );
  }

  return (
    <Shell>
      {body}
      {styles}
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
