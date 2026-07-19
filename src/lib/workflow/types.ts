/**
 * Railyard vNext workflow domain types.
 * Kanban columns remain a projection; execution uses the graph.
 */

export type WorkflowNodeType =
  | "agent"
  | "command"
  | "validator"
  | "human"
  | "delay"
  | "start"
  | "end";

export type WorkflowEdgeCondition =
  | "always"
  | "success"
  | "failure"
  | "validation_pass"
  | "validation_fail"
  | "timeout"
  | "manual"
  | "retry"
  | "needs_human";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  configuration: Record<string, unknown>;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition: WorkflowEdgeCondition;
}

export interface WorkflowGraph {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/** Structured result every runtime must produce for the orchestrator. */
export type AgentResultStatus = "success" | "failure" | "retry" | "needs_human";

export interface AgentResult {
  status: AgentResultStatus;
  summary: string;
  confidence: number;
  outputs: Record<string, unknown>;
  artifacts: string[];
  metadata: Record<string, unknown>;
  /** Human-readable log (not used for routing). */
  log?: string;
}

export interface ValidationResult {
  passed: boolean;
  summary: string;
  issues: string[];
  artifacts: string[];
}

export type WorkflowEventType =
  | "TicketCreated"
  | "TicketUpdated"
  | "TicketDeleted"
  | "StageStarted"
  | "StageCompleted"
  | "StageFailed"
  | "StageRetryRequested"
  | "WorkflowTransitionRequested"
  | "StageEntered"
  | "ReviewRequested"
  | "ReviewApproved"
  | "ReviewRejected"
  | "ChangesRequested"
  | "BudgetWarning"
  | "BudgetExceeded"
  | "ValidationPassed"
  | "ValidationFailed"
  | "SpawnRejected"
  | "ActionRequested"
  | "ActionResolved"
  | "AlertRaised"
  | "TicketArchived";

export interface WorkflowEvent {
  id: string;
  timestamp: string;
  type: WorkflowEventType | string;
  ticketId: string;
  payload: Record<string, unknown>;
}

/** Projected ticket workflow state (derivable from events). */
export interface WorkflowProjection {
  ticketId: string;
  currentNodeId: string | null;
  status: string;
  lastResultStatus: AgentResultStatus | null;
  eventCount: number;
}
