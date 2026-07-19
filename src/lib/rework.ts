/**
 * Agent-emitted routing fences for soft success/failure jumps.
 * Prefer workstream/stage onSuccess / onFailure when agentId omitted.
 */

export type RouteFence = {
  agentId?: string;
  /** Special: review | needs_human | next */
  to?: string;
  reason?: string;
};

const REWORK_FENCE = /```railyard-rework\s*([\s\S]*?)```/i;
const ADVANCE_FENCE = /```railyard-advance\s*([\s\S]*?)```/i;

function parseFence(raw: string): RouteFence {
  const text = raw.trim();
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === "string") {
      const s = parsed.trim();
      if (s === "review" || s === "needs_human" || s === "next") return { to: s };
      return { agentId: s || undefined };
    }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const to =
        typeof obj.to === "string"
          ? obj.to.trim()
          : typeof obj.target === "string"
            ? obj.target.trim()
            : undefined;
      const agentId =
        typeof obj.agentId === "string"
          ? obj.agentId.trim()
          : to && to !== "review" && to !== "needs_human" && to !== "next"
            ? to
            : undefined;
      const reason =
        typeof obj.reason === "string"
          ? obj.reason
          : typeof obj.summary === "string"
            ? obj.summary
            : undefined;
      if (to === "review" || to === "needs_human" || to === "next") {
        return { to, reason, agentId: undefined };
      }
      return { agentId: agentId || undefined, to, reason };
    }
  } catch {
    const line = text.split("\n")[0]?.trim();
    if (line === "review" || line === "needs_human" || line === "next") {
      return { to: line, reason: text };
    }
    if (line) return { agentId: line, reason: text };
  }
  return { reason: text.slice(0, 500) };
}

export function parseReworkRequest(text: string): RouteFence | null {
  const match = text.match(REWORK_FENCE);
  if (!match?.[1]) return null;
  return parseFence(match[1]);
}

export function parseAdvanceRequest(text: string): RouteFence | null {
  const match = text.match(ADVANCE_FENCE);
  if (!match?.[1]) return null;
  return parseFence(match[1]);
}

export function stripReworkFences(text: string): string {
  return text.replace(REWORK_FENCE, "").replace(ADVANCE_FENCE, "").trim();
}

export function stripRouteFences(text: string): string {
  return stripReworkFences(text);
}
