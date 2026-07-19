"use client";

import { useCallback, useEffect, useState } from "react";

type BrowseEntry = {
  name: string;
  path: string;
  isGitRepo: boolean;
  hasChildren: boolean;
};

type BrowseResult = {
  roots: string[];
  cwd: string | null;
  parent: string | null;
  entries: BrowseEntry[];
  cwdIsGitRepo: boolean;
  error?: string;
};

type Props = {
  open: boolean;
  initialPath?: string;
  onClose: () => void;
  onSelect: (absolutePath: string) => void;
};

export function FolderPicker({ open, initialPath, onClose, onSelect }: Props) {
  const [data, setData] = useState<BrowseResult | null>(null);
  const [cwd, setCwd] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextCwd: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const q = nextCwd ? `?cwd=${encodeURIComponent(nextCwd)}` : "";
      const res = await fetch(`/api/fs/browse${q}`, { cache: "no-store" });
      const json = (await res.json()) as BrowseResult;
      if (!res.ok) throw new Error(json.error || "Browse failed");
      setData(json);
      setCwd(json.cwd);
      if (json.error) setError(json.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const start = (initialPath || "").trim() || null;
    void load(start);
  }, [open, initialPath, load]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(20,33,43,0.45)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--rail-line)] bg-[#f7f3ec] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Choose git repository folder"
      >
        <div className="border-b border-[var(--rail-line)] px-5 py-4">
          <h3
            className="text-lg font-bold"
            style={{ fontFamily: "var(--font-syne, var(--font-display))" }}
          >
            Choose repository folder
          </h3>
          <p className="mt-1 text-xs opacity-60">
            Browse under allowed roots. Git repos are marked — select one to use as the board
            path.
          </p>
          <p
            className="mt-2 truncate rounded-lg bg-white/70 px-3 py-2 text-xs"
            style={{ fontFamily: "var(--font-mono)" }}
            title={cwd || "Roots"}
          >
            {cwd || "Allowed roots"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-[var(--rail-line)] px-5 py-2">
          <button
            type="button"
            className="rounded-full border border-[var(--rail-line)] bg-white/70 px-3 py-1 text-xs font-medium disabled:opacity-40"
            disabled={loading || !data?.parent}
            onClick={() => data?.parent && void load(data.parent)}
          >
            ↑ Up
          </button>
          <button
            type="button"
            className="rounded-full border border-[var(--rail-line)] bg-white/70 px-3 py-1 text-xs font-medium"
            disabled={loading}
            onClick={() => void load(null)}
          >
            Roots
          </button>
          {loading && <span className="self-center text-xs opacity-50">Loading…</span>}
          {error && (
            <span className="self-center text-xs text-[var(--rail-signal)]">{error}</span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {(data?.entries || []).length === 0 && !loading && (
            <p className="px-3 py-6 text-center text-sm opacity-50">No folders here</p>
          )}
          <ul className="space-y-0.5">
            {(data?.entries || []).map((entry) => (
              <li key={entry.path} className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/80"
                  onClick={() => void load(entry.path)}
                >
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-sm opacity-40"
                    style={{ background: "#14212b" }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
                  {entry.isGitRepo && (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ background: "rgba(47,111,94,0.18)", color: "#1e4d40" }}
                    >
                      git
                    </span>
                  )}
                  <span className="shrink-0 text-xs opacity-40">Open</span>
                </button>
                {entry.isGitRepo && (
                  <button
                    type="button"
                    className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium"
                    style={{ background: "#14212b", color: "#f3eee6" }}
                    onClick={() => onSelect(entry.path)}
                  >
                    Select
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rail-line)] px-5 py-3">
          <button
            type="button"
            className="rounded-full border border-[var(--rail-line)] px-4 py-2 text-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-full px-4 py-2 text-sm font-medium disabled:opacity-40"
            style={{ background: "#14212b", color: "#f3eee6" }}
            disabled={!data?.cwdIsGitRepo || !cwd}
            onClick={() => {
              if (cwd && data?.cwdIsGitRepo) onSelect(cwd);
            }}
            title={
              data?.cwdIsGitRepo
                ? "Use this folder as repoPath"
                : "Navigate into a folder that contains .git"
            }
          >
            Use this folder
          </button>
        </div>
      </div>
    </div>
  );
}
