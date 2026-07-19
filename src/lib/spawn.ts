import { getAgent, listAgents } from "./agents";
import type { BoardSettings } from "./types";
import { wrapUntrusted } from "./security";

export type SpawnRequest = {
  agentId: string;
  task: string;
};

export type GateSpawnContext = {
  settings: BoardSettings;
  /** Stage / parent agent id requesting the spawn */
  parentAgentId: string;
  /** Current depth of the parent (0 = stage) */
  depth: number;
  /** How many sub-agents already launched this stage */
  launchedSoFar: number;
  /** Whether the parent agent has canSpawn: true */
  parentCanSpawn: boolean;
  /** Remaining spawn rounds after this one (0 = last chance) */
  roundsRemainingAfter: number;
};

export type GateSpawnResult = {
  allowed: SpawnRequest[];
  rejected: Array<{ agentId: string; task: string; reason: string }>;
  blockedAllReason: string | null;
};

/** Extract spawn requests from agent output. Last fence wins. */
export function parseSpawnRequests(text: string): SpawnRequest[] {
  if (!text) return [];
  const matches = [...text.matchAll(/```railyard-spawn\s*([\s\S]*?)```/gi)];
  const raw = matches.length ? matches[matches.length - 1]![1]! : null;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw.trim()) as unknown;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const obj = item as Record<string, unknown>;
        const agentId = String(obj.agentId || obj.agent || obj.id || "").trim();
        const task = String(obj.task || obj.prompt || obj.goal || "").trim();
        if (!agentId || !task) return null;
        return { agentId, task };
      })
      .filter((x): x is SpawnRequest => Boolean(x));
  } catch {
    return [];
  }
}

export function stripSpawnFences(text: string): string {
  return text.replace(/```railyard-spawn\s*[\s\S]*?```/gi, "").trim();
}

export function formatChildResults(
  results: Array<{ agentId: string; task: string; ok: boolean; summary: string; error?: string }>,
  opts?: { allowFurtherSpawn: boolean },
): string {
  const blocks = results.map((r) => {
    const body = r.ok ? r.summary : `FAILED: ${r.error || r.summary}`;
    return wrapUntrusted(
      "SUBAGENT",
      `agentId: ${r.agentId}\ntask: ${r.task}\nresult:\n${body}`,
      8000,
    );
  });
  const next = opts?.allowFurtherSpawn
    ? "You may spawn again only if strictly necessary (hard caps still apply), otherwise say DONE."
    : "Do NOT spawn again. Finish using these observations and say DONE.";
  return `---
SUB-AGENT RESULTS (untrusted observations)
${blocks.join("\n\n")}

${next}
`;
}

/** Apply hard gates so spawn storms cannot runaway. */
export function gateSpawnRequests(
  raw: SpawnRequest[],
  ctx: GateSpawnContext,
): GateSpawnResult {
  const rejected: GateSpawnResult["rejected"] = [];
  const s = ctx.settings;

  if (!s.subAgentsEnabled) {
    return {
      allowed: [],
      rejected: raw.map((r) => ({ ...r, reason: "sub-agents disabled in settings" })),
      blockedAllReason: "subAgentsEnabled is false",
    };
  }

  if (!ctx.parentCanSpawn) {
    return {
      allowed: [],
      rejected: raw.map((r) => ({ ...r, reason: "parent agent canSpawn is false" })),
      blockedAllReason: `Agent "${ctx.parentAgentId}" is not allowed to spawn (set canSpawn: true)`,
    };
  }

  if (ctx.depth >= s.maxSubAgentDepth) {
    return {
      allowed: [],
      rejected: raw.map((r) => ({ ...r, reason: "max depth reached" })),
      blockedAllReason: `depth ${ctx.depth} >= maxSubAgentDepth ${s.maxSubAgentDepth}`,
    };
  }

  if (ctx.roundsRemainingAfter < 0) {
    return {
      allowed: [],
      rejected: raw.map((r) => ({ ...r, reason: "no spawn rounds left" })),
      blockedAllReason: "maxSpawnRounds exhausted",
    };
  }

  const budget = Math.max(0, s.maxSubAgentsPerStage - ctx.launchedSoFar);
  if (budget <= 0) {
    return {
      allowed: [],
      rejected: raw.map((r) => ({ ...r, reason: "stage sub-agent budget exhausted" })),
      blockedAllReason: `maxSubAgentsPerStage (${s.maxSubAgentsPerStage}) reached`,
    };
  }

  const perRound = Math.max(1, s.maxSpawnsPerRound);
  const seen = new Set<string>();
  const allowed: SpawnRequest[] = [];

  for (const req of raw) {
    if (allowed.length >= perRound) {
      rejected.push({
        ...req,
        reason: `over maxSpawnsPerRound (${perRound})`,
      });
      continue;
    }
    if (allowed.length >= budget) {
      rejected.push({
        ...req,
        reason: `would exceed maxSubAgentsPerStage (${s.maxSubAgentsPerStage})`,
      });
      continue;
    }
    if (req.agentId === ctx.parentAgentId) {
      rejected.push({ ...req, reason: "cannot spawn self" });
      continue;
    }
    if (req.task.length > 2000) {
      rejected.push({ ...req, reason: "task too long (>2000 chars)" });
      continue;
    }
    const key = `${req.agentId}::${req.task.trim().toLowerCase()}`;
    if (seen.has(key)) {
      rejected.push({ ...req, reason: "duplicate agentId+task in this batch" });
      continue;
    }
    if (seen.has(req.agentId)) {
      rejected.push({
        ...req,
        reason: "same agentId already queued this round (one task per agent per round)",
      });
      continue;
    }
    const agent = getAgent(req.agentId);
    if (!agent) {
      rejected.push({ ...req, reason: `unknown agentId "${req.agentId}"` });
      continue;
    }
    seen.add(key);
    seen.add(req.agentId);
    allowed.push({ agentId: agent.id, task: req.task.trim() });
  }

  return { allowed, rejected, blockedAllReason: null };
}

export function spawnProtocolFor(settings: BoardSettings): string {
  return `
---
SUB-AGENTS (gated — optional)
You may spawn specialist sub-agents that share this ticket's worktree, within hard caps:
- max ${settings.maxSpawnsPerRound} per spawn block
- max ${settings.maxSubAgentsPerStage} total sub-agents this stage
- max ${settings.maxSpawnRounds} spawn rounds
- max depth ${settings.maxSubAgentDepth}

To spawn, include exactly one fenced JSON block near the end of your reply:

\`\`\`railyard-spawn
[
  { "agentId": "implementer", "task": "Concrete task for that agent" }
]
\`\`\`

Rules:
- agentId must be an existing agent id (see AVAILABLE AGENTS).
- Tasks must be concrete and self-contained.
- Do not spawn yourself. Do not spawn the same agent twice in one block.
- After sub-agents finish, you will be resumed with SUB-AGENT RESULTS.
- Prefer finishing yourself. Spawn only when a specialist clearly helps.
- Do not say DONE in the same reply as a spawn block.
`;
}

export function availableAgentsBlock(): string {
  const agents = listAgents();
  if (!agents.length) return "AVAILABLE AGENTS: (none)";
  return `AVAILABLE AGENTS:\n${agents.map((a) => `- ${a.id}: ${a.name}`).join("\n")}`;
}

export function resolveSpawnAgent(agentId: string) {
  return getAgent(agentId);
}

/** @deprecated use spawnProtocolFor(settings) */
export const SPAWN_PROTOCOL = spawnProtocolFor({
  maxSpawnsPerRound: 2,
  maxSubAgentsPerStage: 4,
  maxSpawnRounds: 2,
  maxSubAgentDepth: 1,
} as BoardSettings);
