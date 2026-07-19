export type RuntimeKind = "cursor" | "opencode" | "copilot" | "demo" | "command";

export type ProviderKind =
  | "cursor"
  | "opencode"
  | "copilot"
  | "deepseek"
  | "openai_compatible";

export type ColumnKind = "inbox" | "agent" | "needs_human" | "complete";

export type TicketStatus =
  | "inbox"
  | "queued"
  | "running"
  | "needs_human"
  | "pending_review"
  | "complete";

export type WorkstreamKind = "pipeline" | "job";

export type CompleteAction = "commit_and_pr" | "note_only" | "connector_reply";

export type StageDef =
  | {
      kind: "agent";
      agentId: string;
      onFailureAgentId?: string | null;
      onSuccess?: string | null;
    }
  | {
      kind: "command";
      id: string;
      title: string;
      argv: string[];
      onFailureAgentId?: string | null;
      onSuccess?: string | null;
    }
  | {
      kind: "validator";
      id: string;
      title: string;
      /** dotnet_build | dotnet_test | review | command */
      validator: "dotnet_build" | "dotnet_test" | "review" | "command";
      argv?: string[];
      onFailureAgentId?: string | null;
      onSuccess?: string | null;
    };

export type JobTrigger =
  | { type: "cron"; expression: string }
  | { type: "manual" }
  | { type: "connector_poll"; connectorId: string };

export interface BoardSettings {
  repoPath: string;
  baseRef: string;
  autoAdvance: boolean;
  parallelRuns: boolean;
  worktreeRoot: string;
  branchPrefix: string;
  /** Provider id (`cursor`, `opencode`, …) or `demo`. */
  defaultRuntime: string;
  /** Model for the selected provider; kept in sync with that provider's defaultModel. */
  defaultModel: string;
  autonomous: boolean;
  adoOrg: string;
  adoProject: string;
  adoQuery: string;
  adoWriteBack: boolean;
  demoMode: boolean;
  /** Active board viewport — which workstream's agent columns to show. */
  activeWorkstreamId: string;
  /** Master switch — when false, all spawn blocks are ignored. */
  subAgentsEnabled: boolean;
  /** 0 = stage agent only; 1 = stage may spawn children; 2 = children may spawn, etc. */
  maxSubAgentDepth: number;
  /** Run sibling sub-agents in parallel when true. */
  subAgentsParallel: boolean;
  /** Max spawn→resume rounds within a single stage run. */
  maxSpawnRounds: number;
  /** Max children accepted from a single spawn block. */
  maxSpawnsPerRound: number;
  /** Max total sub-agent runs launched for one stage invocation. */
  maxSubAgentsPerStage: number;
  /** Soft/hard spend ceilings (USD). 0 = disabled. */
  budgetPerTicketUsd: number;
  budgetPerDayUsd: number;
  /** When true, refuse new runs after budget exceeded. */
  budgetHardStop: boolean;
  /** Imported tickets require human approve before prune/PR. */
  requireApproveForImportedTickets: boolean;
}

/** Named pipeline (or job) template. Stored under workstreams/*.md */
export interface WorkstreamDef {
  id: string;
  name: string;
  kind: WorkstreamKind;
  color: string;
  /** Ordered stages (agent or command) */
  stages: StageDef[];
  /** When true, agent runs use a git worktree */
  git: boolean;
  completeAction: CompleteAction;
  defaultLabels: string[];
  /** Optional cron / trigger for kind=job */
  trigger: JobTrigger | null;
  /**
   * When a stage fails and has no per-stage onFailureAgentId,
   * route here (agent id). Null = Needs human.
   */
  defaultOnFailureAgentId: string | null;
  /**
   * Human "Request changes" from Review → this agent (e.g. planner).
   * Null = last stage (legacy) then Needs human.
   */
  onRequestChangesAgentId: string | null;
  /** Optional body notes below frontmatter */
  notes: string;
  filePath: string;
}

/** Stored on disk under data/providers.json (gitignored). */
export interface ProviderConfig {
  id: string;
  name: string;
  kind: ProviderKind;
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  notes?: string;
}

/** Safe for the frontend — never includes the raw apiKey. */
export interface ProviderPublic {
  id: string;
  name: string;
  kind: ProviderKind;
  enabled: boolean;
  baseUrl: string;
  defaultModel: string;
  notes?: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
}

export type ConnectorKind = "ado" | "trello" | "github" | "linear" | "custom";

export interface ConnectorConfig {
  id: string;
  name: string;
  kind: ConnectorKind;
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  config: Record<string, string>;
  notes?: string;
}

export interface ConnectorPublic {
  id: string;
  name: string;
  kind: ConnectorKind;
  enabled: boolean;
  baseUrl: string;
  config: Record<string, string>;
  notes?: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
}

export interface AgentDef {
  id: string;
  name: string;
  runtime: RuntimeKind;
  model: string;
  autonomous: boolean;
  color: string;
  prompt: string;
  filePath: string;
  /** Only agents with canSpawn may emit railyard-spawn blocks (stage depth 0). */
  canSpawn: boolean;
}

export interface ColumnRow {
  id: string;
  kind: ColumnKind;
  title: string;
  position: number;
  agentId: string | null;
  /** Set on agent columns — which workstream owns this stage */
  workstreamId: string | null;
  locked: boolean;
}

export interface TicketRow {
  id: string;
  adoId: string | null;
  title: string;
  filePath: string;
  columnId: string;
  position: number;
  status: TicketStatus;
  preventAutoAdvance: boolean;
  commentCount: number;
  /** Which workstream pipeline this ticket follows */
  workstreamId: string | null;
  branch: string | null;
  worktreePath: string | null;
  /** Last worktree path before Complete pruned it */
  lastWorktreePath: string | null;
  repoPath: string | null;
  baseRef: string | null;
  headSha: string | null;
  prUrl: string | null;
  failureReason: string | null;
  /** JSON array of { path, status } */
  changedFilesJson: string;
  labelsJson: string;
  /** Workflow graph node id (vNext); null until first stage entered */
  currentNodeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChangedFile {
  path: string;
  status: string; // A|M|D|R…
}

export interface RunTimelineEvent {
  type: "tool" | "file" | "text" | "usage" | "other";
  at: string;
  label: string;
  detail?: string;
}

export interface RunRow {
  id: string;
  ticketId: string;
  agentId: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  log: string;
  startedAt: string;
  endedAt: string | null;
  /** Parent run id when this is a sub-agent */
  parentRunId: string | null;
  /** Depth: 0 = stage agent, 1+ = sub-agent */
  depth: number;
  /** Task text for sub-agents */
  task: string | null;
  model: string | null;
  estimatedTokens: number | null;
  estimatedCostUsd: number | null;
  /** JSON array of RunTimelineEvent */
  eventsJson: string;
  summary: string | null;
  promptHash: string | null;
}

export const DEFAULT_SETTINGS: BoardSettings = {
  repoPath: "",
  baseRef: "main",
  autoAdvance: true,
  parallelRuns: false,
  worktreeRoot: ".worktrees",
  branchPrefix: "agent/",
  defaultRuntime: "cursor",
  defaultModel: "composer-2.5",
  autonomous: true,
  adoOrg: "",
  adoProject: "",
  adoQuery: "",
  adoWriteBack: true,
  demoMode: true,
  activeWorkstreamId: "feature",
  subAgentsEnabled: true,
  maxSubAgentDepth: 1,
  subAgentsParallel: false,
  maxSpawnRounds: 2,
  maxSpawnsPerRound: 2,
  maxSubAgentsPerStage: 4,
  budgetPerTicketUsd: 5,
  budgetPerDayUsd: 25,
  budgetHardStop: true,
  requireApproveForImportedTickets: true,
};

/** Heuristic USD per 1k tokens when provider does not report cost. */
export const DEFAULT_USD_PER_1K_TOKENS = 0.002;
