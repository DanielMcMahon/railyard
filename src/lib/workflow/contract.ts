import type { AgentResult, AgentResultStatus } from "./types";
import { parseAdvanceRequest, parseReworkRequest } from "../rework";

const RESULT_FENCE = /```railyard-result\s*([\s\S]*?)```/i;

/**
 * Build AgentResult from runtime log/summary.
 * Prefers ```railyard-result``` JSON; falls back to rework/advance fences + ok flag.
 * Markdown remains in `log` for humans — orchestrator routes on AgentResult only.
 */
export function toAgentResult(input: {
  ok: boolean;
  summary: string;
  log?: string;
  error?: string;
  estimatedTokens?: number;
  model?: string;
  metadata?: Record<string, unknown>;
}): AgentResult {
  const text = `${input.summary || ""}\n${input.log || ""}`;
  const fenced = parseResultFence(text);
  if (fenced) {
    return {
      ...fenced,
      log: input.log,
      metadata: {
        ...fenced.metadata,
        model: input.model,
        estimatedTokens: input.estimatedTokens,
        ...(input.metadata || {}),
      },
    };
  }

  const rework = parseReworkRequest(text);
  if (rework) {
    return {
      status: "failure",
      summary: rework.reason || input.summary || "Rework requested",
      confidence: 0.5,
      outputs: {
        reworkAgentId: rework.agentId || null,
        reworkTo: rework.to || null,
      },
      artifacts: [],
      metadata: {
        model: input.model,
        estimatedTokens: input.estimatedTokens,
        source: "railyard-rework",
        ...(input.metadata || {}),
      },
      log: input.log,
    };
  }

  const advance = parseAdvanceRequest(text);
  if (advance && input.ok) {
    return {
      status: "success",
      summary: advance.reason || input.summary || "Advance requested",
      confidence: 0.7,
      outputs: {
        advanceAgentId: advance.agentId || null,
        advanceTo: advance.to || null,
      },
      artifacts: [],
      metadata: {
        model: input.model,
        estimatedTokens: input.estimatedTokens,
        source: "railyard-advance",
        ...(input.metadata || {}),
      },
      log: input.log,
    };
  }

  if (!input.ok) {
    return {
      status: "failure",
      summary: input.error || input.summary || "Stage failed",
      confidence: 0.3,
      outputs: {},
      artifacts: [],
      metadata: {
        model: input.model,
        estimatedTokens: input.estimatedTokens,
        ...(input.metadata || {}),
      },
      log: input.log,
    };
  }

  return {
    status: "success",
    summary: input.summary || "OK",
    confidence: 0.8,
    outputs: {},
    artifacts: [],
    metadata: {
      model: input.model,
      estimatedTokens: input.estimatedTokens,
      ...(input.metadata || {}),
    },
    log: input.log,
  };
}

function parseResultFence(text: string): AgentResult | null {
  const match = text.match(RESULT_FENCE);
  if (!match?.[1]) return null;
  try {
    const raw = JSON.parse(match[1]) as Record<string, unknown>;
    const status = normalizeStatus(raw.status);
    return {
      status,
      summary: String(raw.summary || ""),
      confidence: clampConfidence(Number(raw.confidence ?? 0.5)),
      outputs:
        raw.outputs && typeof raw.outputs === "object"
          ? (raw.outputs as Record<string, unknown>)
          : {},
      artifacts: Array.isArray(raw.artifacts) ? raw.artifacts.map(String) : [],
      metadata:
        raw.metadata && typeof raw.metadata === "object"
          ? (raw.metadata as Record<string, unknown>)
          : {},
    };
  } catch {
    return null;
  }
}

function normalizeStatus(raw: unknown): AgentResultStatus {
  const s = String(raw || "").toLowerCase();
  if (s === "success" || s === "ok" || s === "passed") return "success";
  if (s === "retry") return "retry";
  if (s === "needs_human" || s === "needs-human" || s === "human") return "needs_human";
  return "failure";
}

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

/** Map AgentResult status → graph edge condition. */
export function resultToEdgeCondition(
  result: AgentResult,
): "success" | "failure" | "retry" | "needs_human" | "validation_pass" | "validation_fail" {
  if (result.metadata?.validation === true) {
    return result.status === "success" ? "validation_pass" : "validation_fail";
  }
  if (result.status === "success") return "success";
  if (result.status === "retry") return "retry";
  if (result.status === "needs_human") return "needs_human";
  return "failure";
}

export function emptySuccess(summary = "OK"): AgentResult {
  return {
    status: "success",
    summary,
    confidence: 1,
    outputs: {},
    artifacts: [],
    metadata: {},
  };
}
