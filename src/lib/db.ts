import fs from "fs";
import path from "path";
import { DATA_DIR, ensureDirs } from "./paths";
import {
  DEFAULT_BOARD,
  DEFAULT_SETTINGS,
  type BoardDef,
  type BoardSettings,
} from "./types";

const STORE_PATH = path.join(DATA_DIR, "store.json");

export type StoreRun = {
  id: string;
  ticket_id: string;
  agent_id: string;
  status: string;
  log: string;
  started_at: string;
  ended_at: string | null;
  parent_run_id?: string | null;
  depth?: number;
  task?: string | null;
  model?: string | null;
  estimated_tokens?: number | null;
  estimated_cost_usd?: number | null;
  events_json?: string;
  summary?: string | null;
  prompt_hash?: string | null;
};

export type Store = {
  settings: BoardSettings;
  boards?: BoardDef[];
  columns: Array<{
    id: string;
    kind: string;
    title: string;
    position: number;
    agent_id: string | null;
    workstream_id?: string | null;
    locked: number;
  }>;
  tickets: Array<{
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
  }>;
  runs: StoreRun[];
  events?: import("./workflow/types").WorkflowEvent[];
  actionRequests?: import("./human/types").ActionRequest[];
  alerts?: import("./human/types").WorkflowAlert[];
  job_state?: {
    lastTickAt: string | null;
    lastFired: Record<string, string>;
  };
};

function emptyStore(): Store {
  return {
    settings: { ...DEFAULT_SETTINGS },
    boards: [{ ...DEFAULT_BOARD }],
    columns: [],
    tickets: [],
    runs: [],
    job_state: { lastTickAt: null, lastFired: {} },
  };
}

/** Ensure boards exist and tickets have board_id (idempotent). */
export function migrateBoardsInStore(store: Store, workstreamIds: string[] = []): void {
  if (!store.settings) store.settings = { ...DEFAULT_SETTINGS };
  if (!store.settings.activeBoardId) {
    store.settings.activeBoardId = DEFAULT_SETTINGS.activeBoardId;
  }

  if (!store.boards || store.boards.length === 0) {
    const wsIds =
      workstreamIds.length > 0
        ? workstreamIds
        : ["feature", "bug", "research", "dotnet-feature", "demo-job"];
    const activeWs = store.settings.activeWorkstreamId || "feature";
    store.boards = [
      {
        id: "default",
        name: "Default",
        color: "#3d5a80",
        repoPath: store.settings.repoPath || "",
        baseRef: store.settings.baseRef || "main",
        worktreeRoot: store.settings.worktreeRoot || undefined,
        branchPrefix: store.settings.branchPrefix || undefined,
        workstreamIds: wsIds,
        activeWorkstreamId: activeWs,
      },
    ];
    store.settings.activeBoardId = "default";
  }

  for (const t of store.tickets || []) {
    if (!t.board_id) t.board_id = store.settings.activeBoardId || "default";
  }
}

export function readStore(): Store {
  ensureDirs();
  if (!fs.existsSync(STORE_PATH)) {
    const s = emptyStore();
    writeStore(s);
    return s;
  }
  const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as Store;
  if (!parsed.job_state) parsed.job_state = { lastTickAt: null, lastFired: {} };
  if (!parsed.runs) parsed.runs = [];
  migrateBoardsInStore(parsed);
  return parsed;
}

export function writeStore(store: Store) {
  ensureDirs();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export function updateStore(mutator: (store: Store) => void) {
  const store = readStore();
  mutator(store);
  writeStore(store);
  return store;
}

export function getSettings(): BoardSettings {
  const merged = { ...DEFAULT_SETTINGS, ...readStore().settings };
  merged.maxSubAgentDepth = Math.min(2, Math.max(0, Number(merged.maxSubAgentDepth) || 0));
  merged.maxSpawnRounds = Math.min(3, Math.max(1, Number(merged.maxSpawnRounds) || 1));
  merged.maxSpawnsPerRound = Math.min(3, Math.max(1, Number(merged.maxSpawnsPerRound) || 1));
  merged.maxSubAgentsPerStage = Math.min(6, Math.max(1, Number(merged.maxSubAgentsPerStage) || 1));
  if (merged.subAgentsEnabled == null) merged.subAgentsEnabled = true;
  if (merged.budgetPerTicketUsd == null) merged.budgetPerTicketUsd = DEFAULT_SETTINGS.budgetPerTicketUsd;
  if (merged.budgetPerDayUsd == null) merged.budgetPerDayUsd = DEFAULT_SETTINGS.budgetPerDayUsd;
  if (merged.budgetHardStop == null) merged.budgetHardStop = true;
  if (merged.requireApproveForImportedTickets == null) {
    merged.requireApproveForImportedTickets = true;
  }
  if (!merged.activeBoardId) merged.activeBoardId = "default";
  return merged;
}

export function saveSettings(settings: BoardSettings) {
  updateStore((s) => {
    s.settings = settings;
  });
}

export function resetDbFile() {
  ensureDirs();
  if (fs.existsSync(STORE_PATH)) fs.unlinkSync(STORE_PATH);
}

/** Compatibility shim — board.ts historically called getDb(). */
export function getDb() {
  return {
    prepare(sql: string) {
      return {
        run(..._args: unknown[]) {
          throw new Error(`Raw SQL not supported in JSON store: ${sql}`);
        },
        get(..._args: unknown[]) {
          throw new Error(`Raw SQL not supported in JSON store: ${sql}`);
        },
        all(..._args: unknown[]) {
          throw new Error(`Raw SQL not supported in JSON store: ${sql}`);
        },
      };
    },
  };
}
