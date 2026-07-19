/**
 * Human inbox, workflow alerts, and archive case-file types.
 */

export type ActionRequestType =
  | "approval"
  | "permission"
  | "error"
  | "question"
  | "verification";

export type ActionSeverity = "info" | "warning" | "critical";

export type ActionButtonId =
  | "approve"
  | "deny"
  | "modify"
  | "ack"
  | "resume"
  | "retry"
  | "request_changes";

export interface ActionButton {
  id: ActionButtonId;
  label: string;
  primary?: boolean;
}

export type ActionRequestStatus = "open" | "resolved" | "dismissed";

export interface ActionRequest {
  id: string;
  ticketId: string;
  createdAt: string;
  resolvedAt: string | null;
  type: ActionRequestType;
  severity: ActionSeverity;
  title: string;
  description: string;
  requestedBy: string;
  actions: ActionButton[];
  status: ActionRequestStatus;
  /** What the human chose */
  resolution: ActionButtonId | null;
  resolutionNote: string | null;
  metadata: Record<string, unknown>;
}

export type WorkflowAlertKind =
  | "budget_exceeded"
  | "budget_warning"
  | "low_confidence"
  | "retry_loop"
  | "permission_denied"
  | "command_failed"
  | "git_conflict"
  | "api_unavailable"
  | "review_requested"
  | "spawn_rejected"
  | "validation_failed"
  | "needs_human"
  | "other";

export interface WorkflowAlert {
  id: string;
  ticketId: string | null;
  createdAt: string;
  kind: WorkflowAlertKind;
  severity: ActionSeverity;
  title: string;
  message: string;
  acknowledged: boolean;
  metadata: Record<string, unknown>;
}

/** Searchable index row for a completed ticket case file. */
export interface ArchiveIndexEntry {
  ticketId: string;
  title: string;
  archivedAt: string;
  archivePath: string;
  workstreamId: string | null;
  workstreamName: string | null;
  outcome: "complete" | "failed" | "rejected";
  repoPath: string | null;
  branch: string | null;
  prUrl: string | null;
  labels: string[];
  agents: string[];
  models: string[];
  runtimes: string[];
  costUsd: number;
  estimatedTokens: number;
  humanApprover: string | null;
  humanActionCount: number;
  requiredHumanApproval: boolean;
  durationMs: number | null;
}

export interface ArchiveManifest {
  version: 1;
  ticketId: string;
  archivedAt: string;
  immutable: true;
  index: ArchiveIndexEntry;
  files: string[];
}
