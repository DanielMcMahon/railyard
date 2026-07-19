"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AgentDef, BoardSettings, ColumnRow, TicketRow, WorkstreamDef } from "@/lib/types";
import { Shell } from "./Shell";
import { MarkdownView } from "./MarkdownView";
import Link from "next/link";

type BoardPayload = {
  settings: BoardSettings;
  columns: ColumnRow[];
  tickets: TicketRow[];
  agents: Omit<AgentDef, "prompt">[];
  workstreams: Omit<WorkstreamDef, "notes" | "filePath">[];
  activeWorkstreamId: string;
  dayCostUsd?: number;
  ticketCosts?: Record<string, number>;
};

type TicketDetail = {
  ticket: TicketRow;
  markdown: string;
  frontmatter: Record<string, unknown>;
  runs: Array<Record<string, unknown>>;
  cost?: { ticketUsd: number; dayUsd: number };
};

export function BoardApp() {
  const [data, setData] = useState<BoardPayload | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/board", { cache: "no-store" });
    const json = (await res.json()) as BoardPayload;
    setData(json);
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, [refresh]);

  // Keep columns in sync while agents run / auto-advance between tracks
  const hasActiveWork = Boolean(
    data?.tickets.some(
      (t) =>
        t.status === "running" ||
        (t.status === "queued" &&
          data.columns.find((c) => c.id === t.columnId)?.kind === "agent"),
    ),
  );

  useEffect(() => {
    if (!hasActiveWork) return;
    const id = setInterval(() => {
      refresh().catch(() => undefined);
    }, 1500);
    return () => clearInterval(id);
  }, [hasActiveWork, refresh]);

  // Keep open ticket drawer in sync (status / column / notes)
  useEffect(() => {
    if (!selected) return;
    if (!hasActiveWork) return;
    const id = setInterval(() => {
      openTicket(selected.ticket.id).catch(() => undefined);
    }, 2000);
    return () => clearInterval(id);
  }, [selected?.ticket.id, hasActiveWork]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const ticketsByColumn = useMemo(() => {
    const map = new Map<string, TicketRow[]>();
    if (!data) return map;
    for (const c of data.columns) map.set(c.id, []);
    for (const t of data.tickets) {
      const list = map.get(t.columnId) ?? [];
      list.push(t);
      map.set(t.columnId, list);
    }
    for (const [k, list] of map) {
      list.sort((a, b) => a.position - b.position);
      map.set(k, list);
    }
    return map;
  }, [data]);

  async function openTicket(id: string) {
    const res = await fetch(`/api/tickets/${id}`, { cache: "no-store" });
    const json = (await res.json()) as TicketDetail;
    setSelected(json);
  }

  async function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (id.startsWith("ticket:")) {
      setActiveId(id.replace(/^ticket:/, ""));
      setActiveColumnId(null);
    } else if (id.startsWith("stagecol:")) {
      setActiveColumnId(id.replace(/^stagecol:/, ""));
      setActiveId(null);
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setActiveColumnId(null);
    if (!data || !over) return;

    const activeStr = String(active.id);
    const overStr = String(over.id);

    // Column reorder (agent stages only)
    if (activeStr.startsWith("stagecol:")) {
      const fromId = activeStr.replace(/^stagecol:/, "");
      let toId = overStr;
      if (toId.startsWith("stagecol:")) toId = toId.replace(/^stagecol:/, "");
      else if (toId.startsWith("column:")) toId = toId.replace(/^column:/, "");
      else if (toId.startsWith("ticket:")) {
        const overTicket = data.tickets.find((t) => `ticket:${t.id}` === toId);
        if (!overTicket) return;
        toId = overTicket.columnId;
      } else {
        return;
      }
      const agentCols = data.columns.filter((c) => c.kind === "agent");
      const oldIndex = agentCols.findIndex((c) => c.id === fromId);
      const newIndex = agentCols.findIndex((c) => c.id === toId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const next = arrayMove(agentCols, oldIndex, newIndex).map((c) => c.id);
      // Optimistic local reorder
      setData({
        ...data,
        columns: [
          ...data.columns.filter((c) => c.kind === "inbox"),
          ...arrayMove(agentCols, oldIndex, newIndex),
          ...data.columns.filter((c) => c.kind === "needs_human" || c.kind === "complete"),
        ],
      });
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/columns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reorder", columnIds: next }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error || "Reorder failed");
        }
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        await refresh();
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!activeStr.startsWith("ticket:")) return;

    const ticketId = activeStr.replace(/^ticket:/, "");
    let toColumnId = overStr;
    let toIndex = 0;
    if (toColumnId.startsWith("ticket:")) {
      const overTicket = data.tickets.find((t) => `ticket:${t.id}` === toColumnId);
      if (!overTicket) return;
      toColumnId = overTicket.columnId;
      toIndex = overTicket.position;
    } else if (toColumnId.startsWith("column:")) {
      toColumnId = toColumnId.replace("column:", "");
      toIndex = (ticketsByColumn.get(toColumnId) ?? []).length;
    } else if (toColumnId.startsWith("stagecol:")) {
      toColumnId = toColumnId.replace("stagecol:", "");
      toIndex = (ticketsByColumn.get(toColumnId) ?? []).length;
    } else {
      return;
    }
    // No-op if dropped in place
    const current = data.tickets.find((t) => t.id === ticketId);
    if (!current) {
      setError("Ticket not found — refresh the board");
      await refresh();
      return;
    }
    if (current.columnId === toColumnId && current.position === toIndex) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", ticketId, toColumnId, toIndex }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(async () => ({
          error: await res.text().catch(() => "Move failed"),
        }));
        throw new Error(
          (errBody as { error?: string }).error || `Move failed (${res.status})`,
        );
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function switchWorkstream(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workstreams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Switch failed");
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addAgent(agentId: string) {
    setBusy(true);
    try {
      await fetch("/api/columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", agentId }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleLock(columnId: string, locked: boolean) {
    await fetch("/api/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lock", columnId, locked }),
    });
    await refresh();
  }

  async function removeColumn(columnId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", columnId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Remove failed");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function moveColumn(columnId: string, direction: -1 | 1) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", columnId, direction }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Move failed");
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function ticketAction(ticketId: string, action: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ticketId }),
      });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
      if (selected?.ticket.id === ticketId) await openTicket(ticketId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createTicket() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New ticket",
          body: "## Description\n\n\n\n## Acceptance Criteria\n\n- \n",
          labels: [],
          source: "local",
          workstreamId: data?.activeWorkstreamId || data?.settings.activeWorkstreamId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Create failed");
      await refresh();
      if (json.ticket?.id) await openTicket(json.ticket.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveTicket(ticketId: string, patch: { title: string; body: string; labels: string[] }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      const detail = (await res.json()) as TicketDetail;
      setSelected(detail);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteTicket(ticketId: string) {
    if (!confirm("Delete this ticket permanently?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ticketId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSelected(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importDemo() {
    setBusy(true);
    try {
      await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              adoId: String(2000 + Math.floor(Math.random() * 900)),
              title: "Sample connector import",
              commentCount: 2,
              labels: ["imported"],
              description:
                "## Description\n\nImported via demo connector path.\n\n## Acceptance Criteria\n\n- Local markdown created\n- Appears in Inbox\n",
            },
          ],
        }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <Shell>
        <p className="text-sm opacity-70">Loading yard…</p>
      </Shell>
    );
  }

  const placedAgentIds = new Set(
    data.columns.filter((c) => c.agentId).map((c) => c.agentId as string),
  );
  const availableAgents = data.agents.filter((a) => !placedAgentIds.has(a.id));
  const activeTicket = data.tickets.find((t) => t.id === activeId) ?? null;
  const agentColumns = data.columns.filter((c) => c.kind === "agent");
  const activeColumn = activeColumnId
    ? data.columns.find((c) => c.id === activeColumnId) || null
    : null;

  return (
    <Shell>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs font-medium tracking-wide uppercase opacity-60">
            Workstream
          </span>
          <select
            className="rounded-full border border-[var(--rail-line)] bg-white/80 px-3 py-1.5 text-sm font-medium"
            value={data.activeWorkstreamId || data.settings.activeWorkstreamId || "feature"}
            disabled={busy}
            onChange={(e) => switchWorkstream(e.target.value)}
          >
            {(data.workstreams || []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <Link
          href="/workstreams"
          className="rounded-full border border-[var(--rail-line)] bg-white/60 px-3 py-1.5 text-xs font-medium"
        >
          Manage streams
        </Link>
        <button
          type="button"
          onClick={createTicket}
          disabled={busy}
          className="rounded-full px-4 py-2 text-sm font-medium"
          style={{ background: "#14212b", color: "#f3eee6" }}
        >
          New ticket
        </button>
        <button
          type="button"
          onClick={async () => {
            setBusy(true);
            try {
              await fetch("/api/tickets", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "schedule" }),
              });
              await refresh();
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="rounded-full border border-[var(--rail-line)] bg-white/60 px-4 py-2 text-sm font-medium disabled:opacity-50"
          title="Process top of each column"
        >
          Run queue
        </button>
        <button
          type="button"
          onClick={importDemo}
          disabled={busy}
          className="rounded-full border border-[var(--rail-line)] bg-white/60 px-4 py-2 text-sm font-medium"
        >
          Demo import
        </button>
        <span
          className="rounded-full px-3 py-1 text-xs font-medium"
          style={{ fontFamily: "var(--font-mono)", background: "rgba(20,33,43,0.06)" }}
        >
          {data.settings.demoMode ? "demo runtime" : data.settings.defaultRuntime}
          {" · "}
          {data.settings.parallelRuns ? "parallel on" : "serial"}
          {" · "}
          auto-advance {data.settings.autoAdvance ? "on" : "off"}
          {" · "}
          {(data.workstreams || []).find((w) => w.id === data.activeWorkstreamId)?.name ||
            data.activeWorkstreamId}
          {" · "}
          day ${(data.dayCostUsd ?? 0).toFixed(3)}
          {data.settings.budgetPerDayUsd
            ? ` / $${data.settings.budgetPerDayUsd}`
            : ""}
        </span>
        {busy && <span className="text-xs opacity-60">Working…</span>}
        {error && <span className="text-xs text-[var(--rail-signal)]">{error}</span>}
      </div>

      {availableAgents.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium tracking-wide uppercase opacity-60">
            Add stage agent
          </span>
          {availableAgents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => addAgent(a.id)}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-white shadow-sm"
              style={{ background: a.color }}
            >
              + {a.name}
            </button>
          ))}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4">
          {data.columns
            .filter((c) => c.kind === "inbox")
            .map((col) => (
              <SystemColumnView
                key={col.id}
                column={col}
                tickets={ticketsByColumn.get(col.id) ?? []}
                ticketCosts={data.ticketCosts}
                onOpen={openTicket}
                onAction={ticketAction}
              />
            ))}
          <SortableContext
            items={agentColumns.map((c) => `stagecol:${c.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            {agentColumns.map((col, agentIdx) => (
              <AgentColumnView
                key={col.id}
                column={col}
                tickets={ticketsByColumn.get(col.id) ?? []}
                agent={data.agents.find((a) => a.id === col.agentId)}
                ticketCosts={data.ticketCosts}
                canMoveLeft={agentIdx > 0}
                canMoveRight={agentIdx < agentColumns.length - 1}
                onOpen={openTicket}
                onLock={toggleLock}
                onRemove={removeColumn}
                onMove={moveColumn}
                onAction={ticketAction}
              />
            ))}
          </SortableContext>
          {data.columns
            .filter((c) => c.kind === "needs_human" || c.kind === "complete")
            .map((col) => (
              <SystemColumnView
                key={col.id}
                column={col}
                tickets={ticketsByColumn.get(col.id) ?? []}
                ticketCosts={data.ticketCosts}
                onOpen={openTicket}
                onAction={ticketAction}
              />
            ))}
        </div>
        <DragOverlay>
          {activeTicket ? (
            <TicketCard
              ticket={activeTicket}
              overlay
              costUsd={data.ticketCosts?.[activeTicket.id]}
            />
          ) : activeColumn ? (
            <div
              className="w-[280px] rounded-2xl border border-[var(--rail-amber)] bg-white/90 px-3 py-3 shadow-lg"
            >
              <p className="text-[10px] uppercase tracking-wide opacity-50">agent</p>
              <p
                className="text-lg font-bold"
                style={{ fontFamily: "var(--font-syne, var(--font-display))" }}
              >
                {activeColumn.title}
              </p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {selected && (
        <TicketDrawer
          detail={selected}
          onClose={() => setSelected(null)}
          onAction={ticketAction}
          onTogglePrevent={() => ticketAction(selected.ticket.id, "togglePreventAutoAdvance")}
          onSave={(patch) => saveTicket(selected.ticket.id, patch)}
          onDelete={() => deleteTicket(selected.ticket.id)}
        />
      )}
    </Shell>
  );
}

function SystemColumnView({
  column,
  tickets,
  ticketCosts,
  onOpen,
  onAction,
}: {
  column: ColumnRow;
  tickets: TicketRow[];
  ticketCosts?: Record<string, number>;
  onOpen: (id: string) => void;
  onAction: (ticketId: string, action: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${column.id}`,
    data: { type: "column-drop", columnId: column.id },
  });
  return (
    <ColumnShell
      setRef={setNodeRef}
      isOver={isOver}
      column={column}
      tickets={tickets}
      ticketCosts={ticketCosts}
      onOpen={onOpen}
      onAction={onAction}
    />
  );
}

function AgentColumnView({
  column,
  tickets,
  agent,
  ticketCosts,
  canMoveLeft,
  canMoveRight,
  onOpen,
  onLock,
  onRemove,
  onMove,
  onAction,
}: {
  column: ColumnRow;
  tickets: TicketRow[];
  agent?: Omit<AgentDef, "prompt">;
  ticketCosts?: Record<string, number>;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  onOpen: (id: string) => void;
  onLock: (id: string, locked: boolean) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onAction: (ticketId: string, action: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `stagecol:${column.id}`,
    disabled: column.locked,
    data: { type: "column", columnId: column.id },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `column:${column.id}`,
    data: { type: "column-drop", columnId: column.id },
  });

  const setRefs = (node: HTMLElement | null) => {
    setSortableRef(node);
    setDropRef(node);
  };

  return (
    <ColumnShell
      setRef={setRefs}
      isOver={isOver}
      isDragging={isDragging}
      transform={CSS.Transform.toString(transform)}
      transition={transition}
      column={column}
      agent={agent}
      dragHandle={
        !column.locked ? (
          <button
            type="button"
            className="cursor-grab touch-none rounded px-1 text-sm opacity-40 hover:opacity-80 active:cursor-grabbing"
            title="Drag to reorder column"
            aria-label="Drag to reorder column"
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
        ) : null
      }
      controls={
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="text-[11px] font-medium opacity-70 hover:opacity-100 disabled:opacity-30"
            disabled={!canMoveLeft || column.locked}
            title="Move column left"
            onClick={() => onMove(column.id, -1)}
          >
            ←
          </button>
          <button
            type="button"
            className="text-[11px] font-medium opacity-70 hover:opacity-100 disabled:opacity-30"
            disabled={!canMoveRight || column.locked}
            title="Move column right"
            onClick={() => onMove(column.id, 1)}
          >
            →
          </button>
          <button
            type="button"
            className="text-[11px] font-medium opacity-70 hover:opacity-100"
            onClick={() => onLock(column.id, !column.locked)}
          >
            {column.locked ? "Unlock" : "Lock"}
          </button>
          {!column.locked && (
            <button
              type="button"
              className="text-[11px] font-medium text-[var(--rail-signal)] opacity-80 hover:opacity-100"
              onClick={() => onRemove(column.id)}
            >
              Remove
            </button>
          )}
        </div>
      }
      tickets={tickets}
      ticketCosts={ticketCosts}
      onOpen={onOpen}
      onAction={onAction}
    />
  );
}

function ColumnShell({
  setRef,
  isOver,
  isDragging,
  transform,
  transition,
  column,
  agent,
  dragHandle,
  controls,
  tickets,
  ticketCosts,
  onOpen,
  onAction,
}: {
  setRef: (node: HTMLElement | null) => void;
  isOver: boolean;
  isDragging?: boolean;
  transform?: string;
  transition?: string;
  column: ColumnRow;
  agent?: Omit<AgentDef, "prompt">;
  dragHandle?: ReactNode;
  controls?: ReactNode;
  tickets: TicketRow[];
  ticketCosts?: Record<string, number>;
  onOpen: (id: string) => void;
  onAction: (ticketId: string, action: string) => void;
}) {
  return (
    <section
      ref={setRef}
      className={`flex w-[280px] shrink-0 flex-col rounded-2xl border bg-white/55 backdrop-blur-sm ${
        isOver ? "border-[var(--rail-amber)]" : "border-[var(--rail-line)]"
      } ${isDragging ? "opacity-40" : ""}`}
      style={{
        minHeight: 420,
        transform,
        transition,
      }}
    >
      <header className="border-b border-[var(--rail-line)] px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {dragHandle}
              <p
                className="text-[10px] tracking-[0.18em] uppercase opacity-50"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {column.kind.replace("_", " ")}
              </p>
            </div>
            <h2
              className="text-lg font-bold leading-tight"
              style={{ fontFamily: "var(--font-syne, var(--font-display))" }}
            >
              {column.title}
            </h2>
          </div>
          {agent && (
            <span
              className="mt-1 h-3 w-3 rounded-full"
              style={{ background: agent.color }}
              title={agent.runtime}
            />
          )}
        </div>
        {controls}
      </header>
      <SortableContext
        items={tickets.map((t) => `ticket:${t.id}`)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-1 flex-col gap-2 p-2">
          {tickets.map((t) => (
            <SortableTicket
              key={t.id}
              ticket={t}
              costUsd={ticketCosts?.[t.id]}
              onOpen={() => onOpen(t.id)}
              onAction={onAction}
            />
          ))}
          {tickets.length === 0 && (
            <p className="px-2 py-6 text-center text-xs opacity-40">Empty track</p>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableTicket({
  ticket,
  costUsd,
  onOpen,
  onAction,
}: {
  ticket: TicketRow;
  costUsd?: number;
  onOpen: () => void;
  onAction: (ticketId: string, action: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `ticket:${ticket.id}`,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TicketCard ticket={ticket} costUsd={costUsd} onOpen={onOpen} onAction={onAction} />
    </div>
  );
}

function TicketCard({
  ticket,
  onOpen,
  onAction,
  overlay,
  costUsd,
}: {
  ticket: TicketRow;
  onOpen?: () => void;
  onAction?: (ticketId: string, action: string) => void;
  overlay?: boolean;
  costUsd?: number;
}) {
  const labels = JSON.parse(ticket.labelsJson || "[]") as string[];
  return (
    <article
      className={`rounded-xl border border-[var(--rail-line)] bg-[var(--rail-paper)] p-3 shadow-sm ${
        overlay ? "rotate-1 shadow-lg" : ""
      }`}
    >
      <button type="button" className="w-full text-left" onClick={onOpen}>
        <div className="mb-1 flex items-center gap-2 text-[10px] opacity-60" style={{ fontFamily: "var(--font-mono)" }}>
          {ticket.adoId ? `#${ticket.adoId}` : ticket.id.slice(0, 8)}
          {ticket.commentCount > 0 && (
            <span className="rounded bg-black/5 px-1.5 py-0.5">{ticket.commentCount} comments</span>
          )}
          {ticket.preventAutoAdvance && (
            <span className="rounded bg-[var(--rail-amber)]/20 px-1.5 py-0.5 text-[var(--rail-ink)]">
              hold
            </span>
          )}
          {typeof costUsd === "number" && costUsd > 0 && (
            <span className="rounded bg-[var(--rail-ink)]/10 px-1.5 py-0.5">${costUsd.toFixed(3)}</span>
          )}
        </div>
        <h3 className="text-sm font-semibold leading-snug">{ticket.title}</h3>
        <div className="mt-2 flex flex-wrap gap-1">
          <StatusPill status={ticket.status} />
          {labels.map((l) => (
            <span key={l} className="rounded-full bg-black/5 px-2 py-0.5 text-[10px]">
              {l}
            </span>
          ))}
        </div>
      </button>
      {ticket.status === "pending_review" && onAction && (
        <div className="mt-2 flex flex-wrap gap-2 border-t border-[var(--rail-line)] pt-2">
          <button
            type="button"
            className="rounded-full bg-[#2f6f5e] px-2.5 py-1 text-[11px] text-white"
            onClick={() => onAction(ticket.id, "approve")}
          >
            Approve
          </button>
          <button
            type="button"
            className="rounded-full border border-[var(--rail-line)] px-2.5 py-1 text-[11px]"
            onClick={() => onAction(ticket.id, "requestChanges")}
          >
            Changes
          </button>
          <button
            type="button"
            className="rounded-full border border-[var(--rail-signal)]/40 px-2.5 py-1 text-[11px] text-[var(--rail-signal)]"
            onClick={() => onAction(ticket.id, "reject")}
          >
            Reject
          </button>
        </div>
      )}
      {(ticket.status === "needs_human" ||
        (ticket.failureReason && ticket.status !== "pending_review")) &&
        onAction && (
        <div className="mt-2 flex gap-2 border-t border-[var(--rail-line)] pt-2">
          <button
            type="button"
            className="rounded-full bg-[var(--rail-ink)] px-2.5 py-1 text-[11px] text-white"
            onClick={() => onAction(ticket.id, "resume")}
          >
            Resume
          </button>
          <button
            type="button"
            className="rounded-full border border-[var(--rail-line)] px-2.5 py-1 text-[11px]"
            onClick={() => onAction(ticket.id, "retry")}
          >
            Retry
          </button>
        </div>
      )}
    </article>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    inbox: "#5c6b73",
    queued: "#3d5a80",
    running: "#c45c26",
    needs_human: "#a33b2b",
    pending_review: "#8b6914",
    complete: "#2f6f5e",
  };
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
      style={{ background: colors[status] || "#5c6b73" }}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function PathRow({ label, value }: { label: string; value: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  if (!value) {
    return (
      <div className="flex gap-2 text-[11px]">
        <span className="w-24 shrink-0 opacity-50">{label}</span>
        <span className="opacity-40">—</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 text-[11px]">
      <span className="w-24 shrink-0 opacity-50">{label}</span>
      <code className="min-w-0 flex-1 break-all rounded bg-black/5 px-1.5 py-0.5">{value}</code>
      <button
        type="button"
        className="shrink-0 rounded border border-[var(--rail-line)] px-1.5 py-0.5 text-[10px] opacity-70 hover:opacity-100"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          } catch {
            /* ignore */
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function TicketPathsAndDiff({ ticket }: { ticket: TicketRow }) {
  const [files, setFiles] = useState<Array<{ path: string; status: string }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState("");
  const [meta, setMeta] = useState<{
    repoPath?: string | null;
    worktreePath?: string | null;
    lastWorktreePath?: string | null;
    expectedWorktreePath?: string | null;
    worktreeAlive?: boolean;
    branch?: string | null;
    baseRef?: string | null;
    headSha?: string | null;
    artifactsDir?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasGitContext = Boolean(
    ticket.branch ||
      ticket.worktreePath ||
      ticket.lastWorktreePath ||
      ticket.repoPath ||
      ticket.headSha ||
      (ticket.changedFilesJson && ticket.changedFilesJson !== "[]"),
  );

  const loadDiff = useCallback(
    async (file: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const q = file ? `?file=${encodeURIComponent(file)}` : "";
        const res = await fetch(`/api/tickets/${ticket.id}/diff${q}`, { cache: "no-store" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || res.statusText);
        }
        const json = (await res.json()) as {
          files: Array<{ path: string; status: string }>;
          diff: string;
          meta: typeof meta;
        };
        setFiles(json.files || []);
        setDiff(json.diff || "");
        setMeta(json.meta);
        if (file === null && !selected && json.files?.length === 1) {
          setSelected(json.files[0]!.path);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [ticket.id, selected],
  );

  useEffect(() => {
    if (!hasGitContext) return;
    setSelected(null);
    loadDiff(null).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id, ticket.status, ticket.headSha, ticket.worktreePath, hasGitContext]);

  useEffect(() => {
    if (!hasGitContext) return;
    if (selected === null) return;
    loadDiff(selected).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  if (!hasGitContext) return null;

  const worktreeDisplay =
    meta?.worktreePath ||
    ticket.worktreePath ||
    ticket.lastWorktreePath ||
    meta?.lastWorktreePath ||
    meta?.expectedWorktreePath;

  const worktreeLabel = ticket.worktreePath || meta?.worktreeAlive
    ? "Worktree"
    : ticket.lastWorktreePath || meta?.lastWorktreePath
      ? "Last worktree"
      : "Worktree (expected)";

  return (
    <section className="space-y-3 rounded-xl border border-[var(--rail-line)] bg-white/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Paths &amp; diff</h3>
        {loading && <span className="text-[10px] opacity-50">Loading…</span>}
      </div>

      <div className="space-y-1.5" style={{ fontFamily: "var(--font-mono)" }}>
        <PathRow label="Repo" value={meta?.repoPath || ticket.repoPath} />
        <PathRow label={worktreeLabel} value={worktreeDisplay} />
        <PathRow label="Branch" value={meta?.branch || ticket.branch} />
        <PathRow label="Base" value={meta?.baseRef || ticket.baseRef} />
        <PathRow label="SHA" value={meta?.headSha || ticket.headSha} />
        <PathRow label="Artifacts" value={meta?.artifactsDir} />
        <PathRow label="Ticket file" value={ticket.filePath} />
      </div>

      {error && <p className="text-xs text-[var(--rail-signal)]">{error}</p>}

      <div className="flex min-h-[180px] gap-2 border-t border-[var(--rail-line)] pt-3">
        <div className="w-[38%] shrink-0 space-y-1 overflow-y-auto">
          <button
            type="button"
            className={`block w-full rounded-lg px-2 py-1.5 text-left text-[11px] ${
              selected === null ? "bg-[var(--rail-ink)] text-white" : "hover:bg-black/5"
            }`}
            onClick={() => {
              setSelected(null);
              loadDiff(null).catch(() => undefined);
            }}
          >
            Full patch ({files.length} files)
          </button>
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              className={`block w-full rounded-lg px-2 py-1.5 text-left text-[11px] ${
                selected === f.path ? "bg-[var(--rail-ink)] text-white" : "hover:bg-black/5"
              }`}
              style={{ fontFamily: "var(--font-mono)" }}
              onClick={() => setSelected(f.path)}
              title={f.path}
            >
              <span className="mr-1.5 opacity-60">{f.status}</span>
              <span className="break-all">{f.path}</span>
            </button>
          ))}
          {files.length === 0 && !loading && (
            <p className="px-2 text-[11px] opacity-50">No changed files recorded yet.</p>
          )}
        </div>
        <pre
          className="min-h-[160px] flex-1 overflow-auto rounded-lg bg-[#14212b] p-3 text-[11px] leading-relaxed text-[#e8e2d6]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {diff || (loading ? "…" : "No diff for this selection.")}
        </pre>
      </div>
    </section>
  );
}

function LiveRunLog({ ticketId, running }: { ticketId: string; running: boolean }) {
  type RunView = {
    id: string;
    agentId: string;
    status: string;
    log: string;
    parentRunId: string | null;
    depth: number;
    task: string | null;
    startedAt: string;
  };
  const [runs, setRuns] = useState<RunView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch(`/api/tickets/${ticketId}`, { cache: "no-store" });
        const json = await res.json();
        const list = ((json.runs || []) as Array<Record<string, unknown>>).map((r) => ({
          id: String(r.id),
          agentId: String(r.agentId || r.agent_id || ""),
          status: String(r.status || ""),
          log: String(r.log || ""),
          parentRunId: (r.parentRunId ?? r.parent_run_id ?? null) as string | null,
          depth: Number(r.depth ?? 0),
          task: (r.task ?? null) as string | null,
          startedAt: String(r.startedAt || r.started_at || ""),
        }));
        // oldest first for tree reading
        list.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
        if (!cancelled) {
          setRuns(list);
          setSelectedId((prev) => {
            if (prev && list.some((r) => r.id === prev)) return prev;
            const active = [...list].reverse().find((r) => r.status === "running") || list[list.length - 1];
            return active?.id ?? null;
          });
        }
      } catch {
        /* ignore */
      }
    }
    tick();
    const id = setInterval(tick, running ? 1000 : 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ticketId, running]);

  if (!runs.length && !running) return null;

  const selected = runs.find((r) => r.id === selectedId) || runs[runs.length - 1];

  return (
    <details open={running} className="rounded-xl border border-[var(--rail-line)] bg-white/50 p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        Agent activity
        {running ? " (live)" : ""}
        {runs.length ? ` · ${runs.length} run${runs.length === 1 ? "" : "s"}` : ""}
      </summary>

      <div className="mt-3 flex min-h-[160px] gap-2">
        <div className="w-[40%] shrink-0 space-y-1 overflow-y-auto">
          {runs.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedId(r.id)}
              className={`block w-full rounded-lg px-2 py-1.5 text-left text-[11px] ${
                selected?.id === r.id ? "bg-[var(--rail-ink)] text-white" : "hover:bg-black/5"
              }`}
              style={{ paddingLeft: `${8 + r.depth * 12}px` }}
            >
              <span className="font-medium">
                {r.depth > 0 ? "↳ " : ""}
                {r.agentId}
              </span>
              <span className="ml-1 opacity-60">{r.status}</span>
              {r.task && (
                <span className="mt-0.5 block truncate opacity-55" title={r.task}>
                  {r.task}
                </span>
              )}
            </button>
          ))}
        </div>
        <pre
          className="max-h-72 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-[#14212b] p-3 text-[11px] leading-relaxed text-[#e8e2d6]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {selected?.log || (running ? "Waiting for stream…" : "No log yet")}
        </pre>
      </div>
    </details>
  );
}

function RunTimeline({ runs }: { runs: Array<Record<string, unknown>> }) {
  const events = runs
    .flatMap((r) => {
      let parsed: Array<{ type?: string; at?: string; label?: string; detail?: string }> = [];
      try {
        parsed = JSON.parse(String(r.eventsJson || "[]"));
      } catch {
        parsed = [];
      }
      const agentId = String(r.agentId || "");
      const cost =
        typeof r.estimatedCostUsd === "number" ? ` · $${r.estimatedCostUsd.toFixed(4)}` : "";
      const header = {
        type: "other",
        at: String(r.startedAt || ""),
        label: `${agentId} (${r.status})${cost}`,
        detail: r.summary ? String(r.summary).slice(0, 120) : undefined,
      };
      return [header, ...parsed.map((e) => ({ ...e, at: e.at || String(r.startedAt || "") }))];
    })
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
    .slice(-80);

  if (!events.length) return null;
  return (
    <details className="rounded-xl border border-[var(--rail-line)] bg-white/50 p-3" open>
      <summary className="cursor-pointer text-sm font-semibold">Run timeline</summary>
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-[11px]" style={{ fontFamily: "var(--font-mono)" }}>
        {events.map((e, i) => (
          <li key={`${e.at}-${i}`} className="flex gap-2 opacity-80">
            <span className="w-14 shrink-0 opacity-50">{(e.type || "evt").slice(0, 6)}</span>
            <span className="min-w-0 flex-1 break-all">
              {e.label}
              {e.detail ? ` — ${e.detail}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function TicketDrawer({
  detail,
  onClose,
  onAction,
  onTogglePrevent,
  onSave,
  onDelete,
}: {
  detail: TicketDetail;
  onClose: () => void;
  onAction: (ticketId: string, action: string) => void;
  onTogglePrevent: () => void;
  onSave: (patch: { title: string; body: string; labels: string[] }) => void;
  onDelete: () => void;
}) {
  const { ticket, markdown } = detail;
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [title, setTitle] = useState(ticket.title);
  const [body, setBody] = useState(markdown);
  const [labelsText, setLabelsText] = useState(
    (JSON.parse(ticket.labelsJson || "[]") as string[]).join(", "),
  );

  useEffect(() => {
    setTitle(ticket.title);
    setBody(markdown);
    setLabelsText((JSON.parse(ticket.labelsJson || "[]") as string[]).join(", "));
    setMode("preview");
  }, [ticket.id, ticket.title, ticket.labelsJson, markdown]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-3xl flex-col bg-[var(--rail-paper)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--rail-line)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs opacity-50" style={{ fontFamily: "var(--font-mono)" }}>
              {ticket.adoId ? `External ${ticket.adoId}` : "Local ticket"}
            </p>
            {mode === "edit" ? (
              <input
                className="mt-1 w-full rounded-lg border border-[var(--rail-line)] bg-white/80 px-2 py-1.5 text-xl font-bold"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ fontFamily: "var(--font-syne, var(--font-display))" }}
              />
            ) : (
              <h2
                className="text-2xl font-bold"
                style={{ fontFamily: "var(--font-syne, var(--font-display))" }}
              >
                {ticket.title}
              </h2>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-sm opacity-60 hover:opacity-100">
            Close
          </button>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-[var(--rail-line)] px-5 py-3">
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-xs font-medium"
            style={
              mode === "preview"
                ? { background: "#14212b", color: "#f3eee6" }
                : { background: "rgba(255,255,255,0.7)", border: "1px solid var(--rail-line)" }
            }
            onClick={() => setMode("preview")}
          >
            Preview
          </button>
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-xs font-medium"
            style={
              mode === "edit"
                ? { background: "#14212b", color: "#f3eee6" }
                : { background: "rgba(255,255,255,0.7)", border: "1px solid var(--rail-line)" }
            }
            onClick={() => setMode("edit")}
          >
            Edit
          </button>
          {ticket.status === "pending_review" && (
            <>
              <button
                type="button"
                className="rounded-full bg-[#2f6f5e] px-3 py-1.5 text-xs font-medium text-white"
                onClick={() => onAction(ticket.id, "approve")}
              >
                Approve & finish
              </button>
              <button
                type="button"
                className="rounded-full border border-[var(--rail-line)] px-3 py-1.5 text-xs"
                onClick={() => onAction(ticket.id, "requestChanges")}
              >
                Request changes
              </button>
              <button
                type="button"
                className="rounded-full border border-[var(--rail-signal)]/40 px-3 py-1.5 text-xs text-[var(--rail-signal)]"
                onClick={() => onAction(ticket.id, "reject")}
              >
                Reject
              </button>
            </>
          )}
          <button
            type="button"
            className="rounded-full border border-[var(--rail-line)] px-3 py-1.5 text-xs"
            onClick={() => onAction(ticket.id, "resume")}
          >
            Resume
          </button>
          <button
            type="button"
            className="rounded-full border border-[var(--rail-line)] px-3 py-1.5 text-xs"
            onClick={() => onAction(ticket.id, "retry")}
          >
            Retry
          </button>
          <button
            type="button"
            className="rounded-full border border-[var(--rail-line)] px-3 py-1.5 text-xs"
            onClick={onTogglePrevent}
          >
            {ticket.preventAutoAdvance ? "Allow auto-advance" : "Prevent auto-advance"}
          </button>
          <button
            type="button"
            className="ml-auto rounded-full px-3 py-1.5 text-xs text-[#c45c26]"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {ticket.failureReason && (
            <details
              open
              className="rounded-xl border border-[var(--rail-signal)]/40 bg-[var(--rail-signal)]/5 p-3"
            >
              <summary className="cursor-pointer text-sm font-semibold text-[var(--rail-signal)]">
                Failure reason
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs opacity-80">{ticket.failureReason}</pre>
            </details>
          )}
          <div
            className="grid grid-cols-2 gap-2 text-xs opacity-70"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <div>Status: {ticket.status}</div>
            <div>Stream: {ticket.workstreamId || "—"}</div>
            <div>Branch: {ticket.branch || "—"}</div>
            <div>PR: {ticket.prUrl || "—"}</div>
            <div>SHA: {ticket.headSha?.slice(0, 8) || "—"}</div>
            <div>
              Cost: $
              {(detail.cost?.ticketUsd ?? 0).toFixed(4)}
              {" · day $"}
              {(detail.cost?.dayUsd ?? 0).toFixed(4)}
            </div>
          </div>

          <TicketPathsAndDiff ticket={ticket} />

          <RunTimeline runs={detail.runs} />

          <LiveRunLog ticketId={ticket.id} running={ticket.status === "running"} />

          {mode === "edit" ? (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wide opacity-55">
                  Labels (comma-separated)
                </span>
                <input
                  className="w-full rounded-xl border border-[var(--rail-line)] bg-white/80 px-3 py-2 text-sm"
                  value={labelsText}
                  onChange={(e) => setLabelsText(e.target.value)}
                />
              </label>
              <textarea
                className="min-h-[360px] w-full rounded-xl border border-[var(--rail-line)] bg-white/80 px-3 py-3 font-mono text-[13px] leading-relaxed"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                spellCheck={false}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-full px-4 py-2 text-sm font-medium"
                  style={{ background: "#14212b", color: "#f3eee6" }}
                  onClick={() =>
                    onSave({
                      title: title.trim() || "Untitled",
                      body,
                      labels: labelsText
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                >
                  Save ticket
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[var(--rail-line)] px-4 py-2 text-sm"
                  onClick={() => {
                    setTitle(ticket.title);
                    setBody(markdown);
                    setMode("preview");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <MarkdownView content={markdown} />
          )}
        </div>
      </aside>
    </div>
  );
}
