import { randomUUID } from "crypto";
import { getSettings, readStore, updateStore } from "./db";
import { getAgent } from "./agents";
import {
  agentColumnId,
  getWorkstream,
  listWorkstreams,
  stageColumnId,
  stageKey,
  updateWorkstream,
  type WorkstreamInput,
} from "./workstreams";
import type { ColumnKind, ColumnRow, RunRow, StageDef, TicketRow, TicketStatus } from "./types";
import { redactSecrets } from "./security";
import type { StoreRun } from "./db";
import {
  ensureBoardsMigrated,
  getActiveBoard,
  getActiveWorkstreamId,
  setActiveWorkstreamOnBoard,
} from "./boards";

function mapColumn(row: {
  id: string;
  kind: string;
  title: string;
  position: number;
  agent_id: string | null;
  workstream_id?: string | null;
  locked: number;
}): ColumnRow {
  return {
    id: row.id,
    kind: row.kind as ColumnKind,
    title: row.title,
    position: row.position,
    agentId: row.agent_id,
    workstreamId: row.workstream_id ?? null,
    locked: Boolean(row.locked),
  };
}

function mapTicket(row: {
  id: string;
  ado_id: string | null;
  title: string;
  file_path: string;
  column_id: string;
  position: number;
  status: string;
  prevent_auto_advance: number;
  comment_count: number;
  workstream_id?: string | null;
  board_id?: string | null;
  branch: string | null;
  worktree_path: string | null;
  last_worktree_path?: string | null;
  repo_path?: string | null;
  base_ref?: string | null;
  head_sha: string | null;
  pr_url: string | null;
  failure_reason: string | null;
  changed_files_json?: string;
  labels_json: string;
  current_node_id?: string | null;
  created_at: string;
  updated_at: string;
}): TicketRow {
  return {
    id: row.id,
    adoId: row.ado_id,
    title: row.title,
    filePath: row.file_path,
    columnId: row.column_id,
    position: row.position,
    status: row.status as TicketStatus,
    preventAutoAdvance: Boolean(row.prevent_auto_advance),
    commentCount: row.comment_count,
    workstreamId: row.workstream_id ?? null,
    boardId: row.board_id ?? null,
    branch: row.branch,
    worktreePath: row.worktree_path,
    lastWorktreePath: row.last_worktree_path ?? null,
    repoPath: row.repo_path ?? null,
    baseRef: row.base_ref ?? null,
    headSha: row.head_sha,
    prUrl: row.pr_url,
    failureReason: row.failure_reason,
    changedFilesJson: row.changed_files_json ?? "[]",
    labelsJson: row.labels_json,
    currentNodeId: row.current_node_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listColumns(): ColumnRow[] {
  return readStore()
    .columns.slice()
    .sort((a, b) => a.position - b.position)
    .map(mapColumn);
}

/** Columns visible for a workstream viewport (system + that stream's stages). */
export function listVisibleColumns(workstreamId?: string | null): ColumnRow[] {
  const wsId = workstreamId || getActiveWorkstreamId();
  return listColumns().filter(
    (c) => c.kind !== "agent" || c.workstreamId === wsId,
  );
}

export function listTickets(): TicketRow[] {
  return readStore()
    .tickets.slice()
    .sort((a, b) => a.position - b.position)
    .map(mapTicket);
}

/** Tickets for the active board (isolated). */
export function listTicketsForBoard(boardId?: string | null): TicketRow[] {
  const bid = boardId || getActiveBoard().id;
  return listTickets().filter((t) => (t.boardId || "default") === bid);
}

/** Tickets belonging to the active workstream on the active board. */
export function listTicketsForWorkstream(workstreamId?: string | null): TicketRow[] {
  const wsId = workstreamId || getActiveWorkstreamId();
  const boardId = getActiveBoard().id;
  const cols = listColumns();
  const inboxId = cols.find((c) => c.kind === "inbox")?.id;
  return listTicketsForBoard(boardId).filter((t) => {
    if (t.workstreamId === wsId) return true;
    // Unassigned inbox tickets on this board appear until claimed
    if (!t.workstreamId && t.columnId === inboxId) return true;
    return false;
  });
}

export function getTicket(id: string) {
  const row = readStore().tickets.find((t) => t.id === id);
  return row ? mapTicket(row) : null;
}

export function getColumn(id: string) {
  const row = readStore().columns.find((c) => c.id === id);
  return row ? mapColumn(row) : null;
}

export function ensureBaseColumns() {
  const existing = listColumns();
  if (existing.some((c) => c.kind === "inbox")) {
    // Ensure system columns exist even if agent cols already present
    const kinds = new Set(existing.map((c) => c.kind));
    updateStore((s) => {
      if (!kinds.has("inbox")) {
        s.columns.push({
          id: "col-inbox",
          kind: "inbox",
          title: "Inbox",
          position: 0,
          agent_id: null,
          workstream_id: null,
          locked: 0,
        });
      }
      if (!kinds.has("needs_human")) {
        s.columns.push({
          id: "col-needs",
          kind: "needs_human",
          title: "Needs human",
          position: 1000,
          agent_id: null,
          workstream_id: null,
          locked: 0,
        });
      }
      if (!kinds.has("complete")) {
        s.columns.push({
          id: "col-complete",
          kind: "complete",
          title: "Review",
          position: 2000,
          agent_id: null,
          workstream_id: null,
          locked: 0,
        });
      } else {
        const complete = s.columns.find((c) => c.kind === "complete");
        if (complete) complete.title = "Review";
      }
    });
    return listColumns();
  }
  updateStore((s) => {
    s.columns = [
      {
        id: "col-inbox",
        kind: "inbox",
        title: "Inbox",
        position: 0,
        agent_id: null,
        workstream_id: null,
        locked: 0,
      },
      {
        id: "col-needs",
        kind: "needs_human",
        title: "Needs human",
        position: 1000,
        agent_id: null,
        workstream_id: null,
        locked: 0,
      },
      {
        id: "col-complete",
        kind: "complete",
        title: "Review",
        position: 2000,
        agent_id: null,
        workstream_id: null,
        locked: 0,
      },
    ];
  });
  return listColumns();
}

function columnAgentIdForStage(stage: StageDef): string {
  if (stage.kind === "agent") return stage.agentId;
  if (stage.kind === "validator") return `validator:${stage.id}`;
  return `command:${stage.id}`;
}

function stageTitle(stage: StageDef): string {
  if (stage.kind === "command" || stage.kind === "validator") return stage.title || stage.id;
  return getAgent(stage.agentId)?.name || stage.agentId;
}

/** Create/update agent/command columns for a workstream's stages. */
export function syncWorkstreamColumns(workstreamId: string) {
  ensureBaseColumns();
  const ws = getWorkstream(workstreamId);
  if (!ws) throw new Error(`Workstream "${workstreamId}" not found`);

  updateStore((s) => {
    const agentIds = new Set(
      ws.stages.filter((st): st is Extract<StageDef, { kind: "agent" }> => st.kind === "agent").map(
        (st) => st.agentId,
      ),
    );
    for (const c of s.columns) {
      if (c.kind === "agent" && !c.workstream_id && c.agent_id) {
        if (agentIds.has(c.agent_id)) {
          const newId = agentColumnId(workstreamId, c.agent_id);
          const oldId = c.id;
          for (const t of s.tickets) {
            if (t.column_id === oldId) t.column_id = newId;
            if (!t.workstream_id) t.workstream_id = workstreamId;
          }
          c.id = newId;
          c.workstream_id = workstreamId;
        }
      }
    }

    ws.stages.forEach((stage, i) => {
      const id = stageColumnId(workstreamId, stage);
      const agentId = columnAgentIdForStage(stage);
      const title = stageTitle(stage);
      const existing = s.columns.find((c) => c.id === id);
      const position = 10 + i;
      if (existing) {
        existing.title = title;
        existing.position = position;
        existing.agent_id = agentId;
        existing.workstream_id = workstreamId;
      } else {
        s.columns.push({
          id,
          kind: "agent",
          title,
          position,
          agent_id: agentId,
          workstream_id: workstreamId,
          locked: 0,
        });
      }
    });

    const stageIds = new Set(ws.stages.map((st) => stageColumnId(workstreamId, st)));
    const inbox = s.columns.find((c) => c.kind === "inbox");
    const removed = s.columns.filter(
      (c) =>
        c.kind === "agent" &&
        c.workstream_id === workstreamId &&
        !stageIds.has(c.id),
    );
    if (inbox && removed.length) {
      const now = new Date().toISOString();
      let i = 0;
      const maxPos =
        s.tickets
          .filter((t) => t.column_id === inbox.id)
          .reduce((m, t) => Math.max(m, t.position), -1) + 1;
      for (const col of removed) {
        for (const t of s.tickets) {
          if (t.column_id === col.id) {
            t.column_id = inbox.id;
            t.position = maxPos + i;
            t.status = "inbox";
            t.updated_at = now;
            i += 1;
          }
        }
      }
      s.columns = s.columns.filter((c) => !removed.some((r) => r.id === c.id));
    }

    for (const c of s.columns) {
      if (c.kind === "inbox") c.position = 0;
      if (c.kind === "needs_human") c.position = 1000;
      if (c.kind === "complete") {
        c.position = 2000;
        c.title = "Review";
      }
    }
  });

  return listVisibleColumns(workstreamId);
}

/** Sync all known workstreams + backfill ticket workstream/board ids. */
export function ensureWorkstreamsReady() {
  ensureBaseColumns();
  ensureBoardsMigrated();
  const streams = listWorkstreams();
  const board = getActiveBoard();
  const allowed = new Set(
    board.workstreamIds.length
      ? board.workstreamIds
      : streams.map((w) => w.id),
  );
  const active =
    streams.find((w) => w.id === board.activeWorkstreamId && allowed.has(w.id))?.id ||
    streams.find((w) => allowed.has(w.id))?.id ||
    streams.find((w) => w.id === "feature")?.id ||
    streams[0]?.id ||
    "feature";

  if (board.activeWorkstreamId !== active) {
    setActiveWorkstreamOnBoard(active);
  }

  for (const ws of streams) {
    if (allowed.has(ws.id)) syncWorkstreamColumns(ws.id);
  }

  const boardId = getActiveBoard().id;
  updateStore((s) => {
    for (const t of s.tickets) {
      if (!t.board_id) t.board_id = boardId;
      if (t.workstream_id) continue;
      const col = s.columns.find((c) => c.id === t.column_id);
      if (col?.workstream_id) {
        t.workstream_id = col.workstream_id;
      } else {
        t.workstream_id = active;
      }
    }
  });

  return {
    activeBoardId: boardId,
    activeBoard: getActiveBoard(),
    activeWorkstreamId: active,
    columns: listVisibleColumns(active),
    tickets: listTicketsForWorkstream(active),
  };
}

export function setActiveWorkstream(workstreamId: string) {
  const ws = getWorkstream(workstreamId);
  if (!ws) throw new Error(`Workstream "${workstreamId}" not found`);
  syncWorkstreamColumns(workstreamId);
  setActiveWorkstreamOnBoard(workstreamId);
  return ensureWorkstreamsReady();
}

/** @deprecated Prefer syncWorkstreamColumns — kept for columns API compatibility. */
export function addAgentColumn(agentId: string, title: string, workstreamId?: string) {
  const wsId = workstreamId || getActiveWorkstreamId();
  const ws = getWorkstream(wsId);
  if (!ws) throw new Error("Workstream not found");
  const has = ws.stages.some((s) => s.kind === "agent" && s.agentId === agentId);
  if (!has) {
    const patch: WorkstreamInput = {
      id: wsId,
      name: ws.name,
      kind: ws.kind,
      color: ws.color,
      stages: [...ws.stages, { kind: "agent", agentId }],
      git: ws.git,
      completeAction: ws.completeAction,
      defaultLabels: ws.defaultLabels,
      trigger: ws.trigger,
      defaultOnFailureAgentId: ws.defaultOnFailureAgentId,
      onRequestChangesAgentId: ws.onRequestChangesAgentId,
      notes: ws.notes,
    };
    updateWorkstream(wsId, patch);
  }
  void title;
  syncWorkstreamColumns(wsId);
  return getColumn(agentColumnId(wsId, agentId))!;
}

export function setColumnLocked(columnId: string, locked: boolean) {
  updateStore((s) => {
    const c = s.columns.find((x) => x.id === columnId);
    if (c) c.locked = locked ? 1 : 0;
  });
}

/**
 * Move an agent/command/validator column left or right within its workstream.
 * Persists by reordering workstream stages, then re-syncing column positions.
 */
export function moveAgentColumn(columnId: string, direction: -1 | 1): ColumnRow[] {
  const col = getColumn(columnId);
  if (!col || col.kind !== "agent") {
    throw new Error("Only stage columns can be reordered");
  }
  if (col.locked) throw new Error("Column is locked");
  const wsId = col.workstreamId;
  if (!wsId) throw new Error("Column has no workstream");
  const ws = getWorkstream(wsId);
  if (!ws) throw new Error("Workstream not found");

  const stages = [...ws.stages];
  const idx = stages.findIndex((s) => stageColumnId(wsId, s) === columnId);
  if (idx < 0) throw new Error("Stage not found in workstream");
  const j = idx + direction;
  if (j < 0 || j >= stages.length) {
    return listVisibleColumns(wsId);
  }

  const a = stages[idx]!;
  const b = stages[j]!;
  stages[idx] = b;
  stages[j] = a;

  updateWorkstream(wsId, {
    name: ws.name,
    kind: ws.kind,
    color: ws.color,
    stages,
    git: ws.git,
    completeAction: ws.completeAction,
    defaultLabels: ws.defaultLabels,
    trigger: ws.trigger,
    defaultOnFailureAgentId: ws.defaultOnFailureAgentId,
    onRequestChangesAgentId: ws.onRequestChangesAgentId,
    notes: ws.notes,
  });

  return syncWorkstreamColumns(wsId);
}

/**
 * Reorder stage columns by absolute order (drag-and-drop).
 * `orderedColumnIds` must be the full set of agent columns for the workstream.
 */
export function reorderAgentColumns(orderedColumnIds: string[]): ColumnRow[] {
  if (!orderedColumnIds.length) return listVisibleColumns();
  const first = getColumn(orderedColumnIds[0]!);
  if (!first?.workstreamId) throw new Error("Column has no workstream");
  const wsId = first.workstreamId;
  const ws = getWorkstream(wsId);
  if (!ws) throw new Error("Workstream not found");

  for (const id of orderedColumnIds) {
    const c = getColumn(id);
    if (!c || c.kind !== "agent" || c.workstreamId !== wsId) {
      throw new Error("Invalid column order — all must be unlocked stages of one workstream");
    }
    if (c.locked) throw new Error(`Column "${c.title}" is locked`);
  }

  const byColId = new Map(ws.stages.map((s) => [stageColumnId(wsId, s), s]));
  const stages: StageDef[] = [];
  for (const id of orderedColumnIds) {
    const stage = byColId.get(id);
    if (stage) stages.push(stage);
  }
  for (const s of ws.stages) {
    if (!stages.includes(s)) stages.push(s);
  }

  updateWorkstream(wsId, {
    name: ws.name,
    kind: ws.kind,
    color: ws.color,
    stages,
    git: ws.git,
    completeAction: ws.completeAction,
    defaultLabels: ws.defaultLabels,
    trigger: ws.trigger,
    defaultOnFailureAgentId: ws.defaultOnFailureAgentId,
    onRequestChangesAgentId: ws.onRequestChangesAgentId,
    notes: ws.notes,
  });

  return syncWorkstreamColumns(wsId);
}

export function removeAgentColumn(columnId: string) {
  const col = getColumn(columnId);
  if (!col || col.kind !== "agent") throw new Error("Only agent columns can be removed");
  if (col.locked) throw new Error("Column is locked");
  const inbox = listColumns().find((c) => c.kind === "inbox");
  if (!inbox) throw new Error("Missing inbox");

  // Also remove from workstream stages if present
  if (col.workstreamId && col.agentId) {
    const ws = getWorkstream(col.workstreamId);
    if (ws) {
      updateWorkstream(col.workstreamId, {
        name: ws.name,
        kind: ws.kind,
        color: ws.color,
        stages: ws.stages.filter((s) => stageKey(s) !== col.agentId && !(s.kind === "agent" && s.agentId === col.agentId)),
        git: ws.git,
        completeAction: ws.completeAction,
        defaultLabels: ws.defaultLabels,
        trigger: ws.trigger,
        defaultOnFailureAgentId: ws.defaultOnFailureAgentId,
        onRequestChangesAgentId: ws.onRequestChangesAgentId,
        notes: ws.notes,
      });
    }
  }

  updateStore((s) => {
    const maxPos =
      s.tickets.filter((t) => t.column_id === inbox.id).reduce((m, t) => Math.max(m, t.position), -1) +
      1;
    const now = new Date().toISOString();
    let i = 0;
    for (const t of s.tickets) {
      if (t.column_id === columnId) {
        t.column_id = inbox.id;
        t.position = maxPos + i;
        t.status = "inbox";
        t.updated_at = now;
        i += 1;
      }
    }
    s.columns = s.columns.filter((c) => c.id !== columnId);
  });
}

export function nextPosition(columnId: string) {
  const row = readStore().tickets.filter((t) => t.column_id === columnId);
  if (row.length === 0) return 0;
  return Math.max(...row.map((t) => t.position)) + 1;
}

export function insertTicket(
  ticket: Omit<TicketRow, "createdAt" | "updatedAt" | "position" | "boardId"> & {
    position?: number;
    boardId?: string | null;
  },
) {
  const now = new Date().toISOString();
  const position = ticket.position ?? nextPosition(ticket.columnId);
  const boardId = ticket.boardId || getActiveBoard().id;
  updateStore((s) => {
    s.tickets.push({
      id: ticket.id,
      ado_id: ticket.adoId,
      title: ticket.title,
      file_path: ticket.filePath,
      column_id: ticket.columnId,
      position,
      status: ticket.status,
      prevent_auto_advance: ticket.preventAutoAdvance ? 1 : 0,
      comment_count: ticket.commentCount,
      workstream_id: ticket.workstreamId,
      board_id: boardId,
      branch: ticket.branch,
      worktree_path: ticket.worktreePath,
      last_worktree_path: ticket.lastWorktreePath,
      repo_path: ticket.repoPath,
      base_ref: ticket.baseRef,
      head_sha: ticket.headSha,
      pr_url: ticket.prUrl,
      failure_reason: ticket.failureReason,
      changed_files_json: ticket.changedFilesJson,
      labels_json: ticket.labelsJson,
      current_node_id: ticket.currentNodeId ?? null,
      created_at: now,
      updated_at: now,
    });
  });
  return getTicket(ticket.id)!;
}

export function updateTicket(id: string, patch: Partial<TicketRow>) {
  const current = getTicket(id);
  if (!current) throw new Error("Ticket not found");
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  updateStore((s) => {
    const t = s.tickets.find((x) => x.id === id);
    if (!t) return;
    t.ado_id = next.adoId;
    t.title = next.title;
    t.file_path = next.filePath;
    t.column_id = next.columnId;
    t.position = next.position;
    t.status = next.status;
    t.prevent_auto_advance = next.preventAutoAdvance ? 1 : 0;
    t.comment_count = next.commentCount;
    t.workstream_id = next.workstreamId;
    t.board_id = next.boardId;
    t.branch = next.branch;
    t.worktree_path = next.worktreePath;
    t.last_worktree_path = next.lastWorktreePath;
    t.repo_path = next.repoPath;
    t.base_ref = next.baseRef;
    t.head_sha = next.headSha;
    t.pr_url = next.prUrl;
    t.failure_reason = next.failureReason;
    t.changed_files_json = next.changedFilesJson;
    t.labels_json = next.labelsJson;
    t.current_node_id = next.currentNodeId ?? null;
    t.updated_at = next.updatedAt;
  });
  return getTicket(id)!;
}

export function moveTicket(ticketId: string, toColumnId: string, toIndex: number) {
  const ticket = getTicket(ticketId);
  if (!ticket) throw new Error("Ticket not found");
  const toCol = getColumn(toColumnId);
  updateStore((s) => {
    const others = s.tickets
      .filter((t) => t.column_id === toColumnId && t.id !== ticketId)
      .sort((a, b) => a.position - b.position);
    const moving = s.tickets.find((t) => t.id === ticketId)!;
    others.splice(Math.max(0, Math.min(toIndex, others.length)), 0, moving);
    const now = new Date().toISOString();
    others.forEach((t, i) => {
      t.column_id = toColumnId;
      t.position = i;
      t.updated_at = now;
    });
    // Claim workstream when entering an agent column
    if (toCol?.workstreamId) {
      moving.workstream_id = toCol.workstreamId;
    }
  });
  return getTicket(ticketId)!;
}

export function reorderColumns(orderedIds: string[]) {
  updateStore((s) => {
    orderedIds.forEach((id, i) => {
      const c = s.columns.find((x) => x.id === id);
      if (c) c.position = i;
    });
  });
}

/** Stage columns for a ticket's workstream, in order. */
export function listAgentColumnsForTicket(ticket: TicketRow): ColumnRow[] {
  const wsId = ticket.workstreamId || getActiveWorkstreamId();
  syncWorkstreamColumns(wsId);
  const ws = getWorkstream(wsId);
  if (!ws) return [];
  return ws.stages
    .map((stage) => getColumn(stageColumnId(wsId, stage)))
    .filter((c): c is ColumnRow => Boolean(c));
}

export function insertRun(
  ticketId: string,
  agentId: string,
  opts?: {
    parentRunId?: string | null;
    depth?: number;
    task?: string | null;
    model?: string | null;
    promptHash?: string | null;
  },
) {
  const id = randomUUID();
  const startedAt = new Date().toISOString();
  updateStore((s) => {
    s.runs.push({
      id,
      ticket_id: ticketId,
      agent_id: agentId,
      status: "running",
      log: "",
      started_at: startedAt,
      ended_at: null,
      parent_run_id: opts?.parentRunId ?? null,
      depth: opts?.depth ?? 0,
      task: opts?.task ?? null,
      model: opts?.model ?? null,
      estimated_tokens: null,
      estimated_cost_usd: null,
      events_json: "[]",
      summary: null,
      prompt_hash: opts?.promptHash ?? null,
    });
  });
  return id;
}

export function finishRun(
  id: string,
  status: "succeeded" | "failed",
  log: string,
  meta?: {
    model?: string | null;
    estimatedTokens?: number | null;
    estimatedCostUsd?: number | null;
    eventsJson?: string;
    summary?: string | null;
  },
) {
  updateStore((s) => {
    const r = s.runs.find((x) => x.id === id);
    if (!r) return;
    r.status = status;
    r.log = log;
    r.ended_at = new Date().toISOString();
    if (meta?.model != null) r.model = meta.model;
    if (meta?.estimatedTokens != null) r.estimated_tokens = meta.estimatedTokens;
    if (meta?.estimatedCostUsd != null) r.estimated_cost_usd = meta.estimatedCostUsd;
    if (meta?.eventsJson != null) r.events_json = meta.eventsJson;
    if (meta?.summary != null) r.summary = meta.summary;
  });
}

export function appendRunEvent(id: string, event: { type: string; at: string; label: string; detail?: string }) {
  updateStore((s) => {
    const r = s.runs.find((x) => x.id === id);
    if (!r) return;
    let events: unknown[] = [];
    try {
      events = JSON.parse(r.events_json || "[]");
    } catch {
      events = [];
    }
    if (!Array.isArray(events)) events = [];
    events.push(event);
    r.events_json = JSON.stringify(events.slice(-200));
  });
}

export function appendRunLog(id: string, chunk: string) {
  const safe = redactSecrets(chunk.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ""));
  updateStore((s) => {
    const r = s.runs.find((x) => x.id === id);
    if (!r) return;
    r.log = (r.log || "") + safe;
  });
}

export function getRun(id: string) {
  const r = readStore().runs.find((x) => x.id === id);
  return r ? mapRun(r) : null;
}

function mapRun(r: StoreRun): RunRow {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    agentId: r.agent_id,
    status: r.status as RunRow["status"],
    log: r.log,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    parentRunId: r.parent_run_id ?? null,
    depth: r.depth ?? 0,
    task: r.task ?? null,
    model: r.model ?? null,
    estimatedTokens: r.estimated_tokens ?? null,
    estimatedCostUsd: r.estimated_cost_usd ?? null,
    eventsJson: r.events_json ?? "[]",
    summary: r.summary ?? null,
    promptHash: r.prompt_hash ?? null,
  };
}

export function listRunsForTicket(ticketId: string): RunRow[] {
  return readStore()
    .runs.filter((r) => r.ticket_id === ticketId)
    .map(mapRun)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function deleteTicket(id: string) {
  const ticket = getTicket(id);
  if (!ticket) throw new Error("Ticket not found");
  updateStore((s) => {
    s.tickets = s.tickets.filter((t) => t.id !== id);
    s.runs = s.runs.filter((r) => r.ticket_id !== id);
  });
  return ticket;
}
