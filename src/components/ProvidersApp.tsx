"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProviderPublic } from "@/lib/types";
import { Shell } from "./Shell";

type Draft = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  baseUrl: string;
  defaultModel: string;
  notes: string;
  apiKeyInput: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
  isCustom: boolean;
};

const BUILTIN_IDS = new Set(["cursor", "opencode", "deepseek", "copilot", "openai"]);

export function ProvidersApp({ embedded = false }: { embedded?: boolean }) {
  const [providers, setProviders] = useState<ProviderPublic[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/providers", { cache: "no-store" });
    const json = (await res.json()) as { providers: ProviderPublic[] };
    setProviders(json.providers);
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, [refresh]);

  function openEdit(p: ProviderPublic) {
    setCreating(false);
    setError(null);
    setDraft({
      id: p.id,
      name: p.name,
      kind: p.kind,
      enabled: p.enabled,
      baseUrl: p.baseUrl,
      defaultModel: p.defaultModel,
      notes: p.notes || "",
      apiKeyInput: "",
      hasApiKey: p.hasApiKey,
      apiKeyMasked: p.apiKeyMasked,
      isCustom: !BUILTIN_IDS.has(p.id),
    });
  }

  function startCreate() {
    setCreating(true);
    setError(null);
    setDraft({
      id: "",
      name: "",
      kind: "openai_compatible",
      enabled: true,
      baseUrl: "https://",
      defaultModel: "",
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
      if (creating) {
        const res = await fetch("/api/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            id: draft.id,
            name: draft.name,
            baseUrl: draft.baseUrl,
            defaultModel: draft.defaultModel,
            apiKey: draft.apiKeyInput,
            notes: draft.notes,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Create failed");
        setProviders(json.providers);
        setDraft(null);
        setCreating(false);
      } else {
        const res = await fetch("/api/providers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: draft.id,
            name: draft.name,
            enabled: draft.enabled,
            baseUrl: draft.baseUrl,
            defaultModel: draft.defaultModel,
            notes: draft.notes,
            apiKey: draft.apiKeyInput || undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Save failed");
        setProviders(json.providers);
        const updated = json.providers.find((p: ProviderPublic) => p.id === draft.id);
        if (updated) openEdit(updated);
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
      const res = await fetch("/api/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id, clearApiKey: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Clear failed");
      setProviders(json.providers);
      openEdit(json.providers.find((p: ProviderPublic) => p.id === draft.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.isCustom) return;
    if (!confirm(`Delete provider "${draft.id}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/providers?id=${encodeURIComponent(draft.id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
      setProviders(json.providers);
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
              Providers
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
            API keys stay in <code className="text-xs">data/providers.json</code> (gitignored).
            Never returned in full to the browser.
          </p>
          <ul className="space-y-2">
            {providers.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="flex w-full items-start gap-3 rounded-xl border border-[var(--rail-line)] bg-white/55 px-3 py-3 text-left hover:bg-white/80"
                  style={{
                    outline: draft?.id === p.id && !creating ? "2px solid #14212b" : undefined,
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{p.name}</span>
                      {!p.enabled && (
                        <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px]">off</span>
                      )}
                    </span>
                    <span
                      className="mt-0.5 block truncate text-[11px] opacity-50"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {p.kind}
                      {p.hasApiKey ? ` · key ${p.apiKeyMasked}` : " · no key"}
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
                {creating ? "New provider" : draft.name}
              </h3>
              <div className="space-y-4">
                {creating && (
                  <Field label="Id">
                    <input
                      className="ry-field"
                      value={draft.id}
                      placeholder="my-gateway"
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
                    placeholder="https://api.example.com/v1"
                    onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                  />
                </Field>
                <Field label="Default model">
                  <input
                    className="ry-field"
                    value={draft.defaultModel}
                    onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value })}
                  />
                </Field>
                <Field
                  label={
                    draft.hasApiKey && !draft.apiKeyInput
                      ? `API key (saved ${draft.apiKeyMasked} — paste to replace)`
                      : "API key"
                  }
                >
                  <input
                    className="ry-field"
                    type="password"
                    autoComplete="off"
                    value={draft.apiKeyInput}
                    placeholder={draft.hasApiKey ? "•••••••• (unchanged if empty)" : "sk-…"}
                    onChange={(e) => setDraft({ ...draft, apiKeyInput: e.target.value })}
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
                    className="rounded-full border border-[var(--rail-line)] bg-white/70 px-4 py-2.5 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  {!creating && draft.hasApiKey && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={clearKey}
                      className="rounded-full px-4 py-2.5 text-sm font-medium opacity-70"
                    >
                      Clear key
                    </button>
                  )}
                  {draft.isCustom && !creating && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={remove}
                      className="ml-auto rounded-full px-4 py-2.5 text-sm font-medium text-[#c45c26]"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-[var(--rail-line)] bg-white/30 px-6 text-center text-sm opacity-55">
              Select a provider to set API key and base URL, or add a custom OpenAI-compatible
              endpoint.
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
