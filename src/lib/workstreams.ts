import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { WORKSTREAMS_DIR, ensureDirs } from "./paths";
import type {
  CompleteAction,
  JobTrigger,
  StageDef,
  WorkstreamDef,
  WorkstreamKind,
} from "./types";
import { assertPathInside, assertSafeId } from "./security";

export type WorkstreamInput = {
  id: string;
  name: string;
  kind: WorkstreamKind;
  color: string;
  stages: StageDef[] | string[];
  git: boolean;
  completeAction: CompleteAction;
  defaultLabels: string[];
  trigger?: JobTrigger | null;
  defaultOnFailureAgentId?: string | null;
  onRequestChangesAgentId?: string | null;
  notes?: string;
};

function slugId(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function workstreamPath(id: string) {
  ensureDirs();
  const safe = assertSafeId(id, "workstream id");
  const filePath = path.join(WORKSTREAMS_DIR, `${safe}.md`);
  const dir = fs.realpathSync(WORKSTREAMS_DIR);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(dir + path.sep) && path.dirname(resolved) !== dir) {
    throw new Error("Invalid workstream path");
  }
  return resolved;
}

function parseOnFailureAgentId(raw: unknown): string | null | undefined {
  if (raw == null || raw === "") return undefined;
  if (raw === false || raw === "needs_human" || raw === "none") return null;
  const id = String(raw).trim();
  return id || undefined;
}

function parseOnSuccess(raw: unknown): string | null | undefined {
  if (raw == null || raw === "") return undefined;
  const id = String(raw).trim();
  if (!id || id === "next") return "next";
  if (id === "review" || id === "complete" || id === "pending_review") return "review";
  if (id === "needs_human") return "needs_human";
  return id;
}

export function normalizeStages(raw: unknown): StageDef[] {
  if (!Array.isArray(raw)) {
    if (typeof raw === "string") {
      return raw
        .split(/[,[\]]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((agentId) => ({ kind: "agent" as const, agentId }));
    }
    return [];
  }
  const out: StageDef[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const agentId = item.trim();
      if (agentId) out.push({ kind: "agent", agentId });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const kind = String(obj.kind || "agent");
    const onFailure = parseOnFailureAgentId(
      obj.onFailureAgentId ?? obj.onFailure ?? undefined,
    );
    const onSuccess = parseOnSuccess(obj.onSuccess ?? obj.onSuccessAgentId ?? undefined);
    if (kind === "command") {
      const id = String(obj.id || "cmd").trim().slice(0, 48);
      const title = String(obj.title || id).trim();
      let argv: string[] = [];
      if (Array.isArray(obj.argv)) argv = obj.argv.map(String);
      else if (Array.isArray(obj.command)) argv = obj.command.map(String);
      else if (typeof obj.command === "string") {
        argv = obj.command.split(/\s+/).filter(Boolean);
      }
      if (!id || !argv.length) continue;
      const stage: StageDef = { kind: "command", id, title, argv };
      if (onFailure !== undefined) stage.onFailureAgentId = onFailure;
      if (onSuccess !== undefined) stage.onSuccess = onSuccess;
      out.push(stage);
    } else if (kind === "validator") {
      const id = String(obj.id || "validate").trim().slice(0, 48);
      const title = String(obj.title || id).trim();
      const validator = String(obj.validator || "dotnet_test") as
        | "dotnet_build"
        | "dotnet_test"
        | "review"
        | "command";
      let argv: string[] | undefined;
      if (Array.isArray(obj.argv)) argv = obj.argv.map(String);
      if (!id) continue;
      const stage: StageDef = { kind: "validator", id, title, validator, argv };
      if (onFailure !== undefined) stage.onFailureAgentId = onFailure;
      if (onSuccess !== undefined) stage.onSuccess = onSuccess;
      out.push(stage);
    } else {
      const agentId = String(obj.agentId || obj.id || "").trim();
      if (!agentId) continue;
      const stage: StageDef = { kind: "agent", agentId };
      if (onFailure !== undefined) stage.onFailureAgentId = onFailure;
      if (onSuccess !== undefined) stage.onSuccess = onSuccess;
      out.push(stage);
    }
  }
  return out;
}

function parseLabels(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function parseTrigger(raw: unknown): JobTrigger | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const type = String(t.type || "");
  if (type === "cron" && typeof t.expression === "string") {
    return { type: "cron", expression: t.expression };
  }
  if (type === "connector_poll" && typeof t.connectorId === "string") {
    return { type: "connector_poll", connectorId: t.connectorId };
  }
  if (type === "manual") return { type: "manual" };
  return null;
}

function parseOptionalAgentId(raw: unknown): string | null {
  if (raw == null || raw === "" || raw === false || raw === "needs_human" || raw === "none") {
    return null;
  }
  const id = String(raw).trim();
  return id || null;
}

/** Serialize stages for YAML — plain agent strings unless routing overrides set. */
export function stagesForFrontmatter(stages: StageDef[]): unknown[] {
  return stages.map((s) => {
    const hasRouting =
      s.onFailureAgentId !== undefined ||
      (s.onSuccess !== undefined && s.onSuccess !== "next");
    if (s.kind === "agent") {
      if (!hasRouting) return s.agentId;
      const out: Record<string, unknown> = {
        kind: "agent",
        agentId: s.agentId,
      };
      if (s.onFailureAgentId !== undefined) {
        out.onFailure = s.onFailureAgentId === null ? "needs_human" : s.onFailureAgentId;
      }
      if (s.onSuccess !== undefined && s.onSuccess !== "next") {
        out.onSuccess = s.onSuccess;
      }
      return out;
    }
    if (s.kind === "validator") {
      const base: Record<string, unknown> = {
        kind: "validator",
        id: s.id,
        title: s.title,
        validator: s.validator,
      };
      if (s.argv?.length) base.argv = s.argv;
      if (s.onFailureAgentId !== undefined) {
        base.onFailure = s.onFailureAgentId === null ? "needs_human" : s.onFailureAgentId;
      }
      if (s.onSuccess !== undefined && s.onSuccess !== "next") {
        base.onSuccess = s.onSuccess;
      }
      return base;
    }
    const base: Record<string, unknown> = {
      kind: "command",
      id: s.id,
      title: s.title,
      argv: s.argv,
    };
    if (s.onFailureAgentId !== undefined) {
      base.onFailure = s.onFailureAgentId === null ? "needs_human" : s.onFailureAgentId;
    }
    if (s.onSuccess !== undefined && s.onSuccess !== "next") {
      base.onSuccess = s.onSuccess;
    }
    return base;
  });
}

export function stageKey(stage: StageDef): string {
  if (stage.kind === "agent") return stage.agentId;
  if (stage.kind === "validator") return `validator:${stage.id}`;
  return `command:${stage.id}`;
}

export function stageColumnId(workstreamId: string, stage: StageDef): string {
  if (stage.kind === "agent") return `col-ws-${workstreamId}-${stage.agentId}`;
  if (stage.kind === "validator") return `col-ws-${workstreamId}-val-${stage.id}`;
  return `col-ws-${workstreamId}-cmd-${stage.id}`;
}

export function agentColumnId(workstreamId: string, agentId: string) {
  return `col-ws-${workstreamId}-${agentId}`;
}

export function isCommandColumnAgentId(agentId: string | null | undefined): boolean {
  return Boolean(
    agentId && (agentId.startsWith("command:") || agentId.startsWith("validator:")),
  );
}

export function commandIdFromAgentId(agentId: string): string {
  return agentId.replace(/^(command|validator):/, "");
}

export function findStage(ws: WorkstreamDef, columnAgentId: string | null): StageDef | null {
  if (!columnAgentId) return null;
  if (columnAgentId.startsWith("command:")) {
    const id = commandIdFromAgentId(columnAgentId);
    return ws.stages.find((s) => s.kind === "command" && s.id === id) ?? null;
  }
  if (columnAgentId.startsWith("validator:")) {
    const id = commandIdFromAgentId(columnAgentId);
    return ws.stages.find((s) => s.kind === "validator" && s.id === id) ?? null;
  }
  return ws.stages.find((s) => s.kind === "agent" && s.agentId === columnAgentId) ?? null;
}

/** Resolve which agent (if any) should receive a failed stage. */
export function resolveOnFailureAgentId(
  ws: WorkstreamDef,
  stage: StageDef | null,
): string | null {
  if (stage?.onFailureAgentId !== undefined) {
    return stage.onFailureAgentId;
  }
  return ws.defaultOnFailureAgentId ?? null;
}

/**
 * Resolve success routing for a stage.
 * Returns: `next` | `review` | `needs_human` | agentId
 */
export function resolveOnSuccessTarget(
  stage: StageDef | null,
  override?: string | null,
): string {
  if (override) {
    if (override === "complete" || override === "pending_review") return "review";
    return override;
  }
  const configured = stage?.onSuccess;
  if (!configured || configured === "next") return "next";
  if (configured === "complete" || configured === "pending_review") return "review";
  return configured;
}

function parseWorkstreamFile(filePath: string): WorkstreamDef {
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  const kind = (data.kind as WorkstreamKind) || "pipeline";
  const completeAction = (data.completeAction as CompleteAction) || "commit_and_pr";
  return {
    id: String(data.id ?? path.basename(filePath, ".md")),
    name: String(data.name ?? path.basename(filePath, ".md")),
    kind,
    color: String(data.color ?? "#3d5a80"),
    stages: normalizeStages(data.stages),
    git: data.git !== false,
    completeAction,
    defaultLabels: parseLabels(data.defaultLabels),
    trigger: parseTrigger(data.trigger),
    defaultOnFailureAgentId: parseOptionalAgentId(
      data.defaultOnFailureAgentId ?? data.defaultOnFailure,
    ),
    onRequestChangesAgentId: parseOptionalAgentId(
      data.onRequestChangesAgentId ?? data.onRequestChanges,
    ),
    notes: content.trim(),
    filePath,
  };
}

export function listWorkstreams(): WorkstreamDef[] {
  ensureDirs();
  if (!fs.existsSync(WORKSTREAMS_DIR)) return [];
  return fs
    .readdirSync(WORKSTREAMS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((file) => parseWorkstreamFile(path.join(WORKSTREAMS_DIR, file)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getWorkstream(id: string): WorkstreamDef | null {
  if (!id || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)) {
    return listWorkstreams().find((w) => w.id === id) ?? null;
  }
  try {
    const filePath = workstreamPath(id);
    if (fs.existsSync(filePath)) return parseWorkstreamFile(filePath);
  } catch {
    /* invalid */
  }
  return listWorkstreams().find((w) => w.id === id) ?? null;
}

export function writeWorkstream(input: WorkstreamInput): WorkstreamDef {
  ensureDirs();
  const id = slugId(input.id);
  if (!id) throw new Error("Workstream id is required");
  const filePath = workstreamPath(id);
  const stages = normalizeStages(input.stages);
  const front: Record<string, unknown> = {
    id,
    name: input.name.trim() || id,
    kind: input.kind || "pipeline",
    color: input.color || "#3d5a80",
    stages: stagesForFrontmatter(stages),
    git: input.git !== false,
    completeAction: input.completeAction || "commit_and_pr",
    defaultLabels: input.defaultLabels || [],
  };
  if (input.trigger) front.trigger = input.trigger;
  if (input.defaultOnFailureAgentId) {
    front.defaultOnFailure = input.defaultOnFailureAgentId;
  }
  if (input.onRequestChangesAgentId) {
    front.onRequestChanges = input.onRequestChangesAgentId;
  }
  const body = (input.notes || "").trim() + (input.notes?.trim() ? "\n" : "");
  fs.writeFileSync(filePath, matter.stringify(body || "\n", front), "utf8");
  return parseWorkstreamFile(filePath);
}

export function createWorkstream(input: WorkstreamInput): WorkstreamDef {
  const id = slugId(input.id);
  if (!id) throw new Error("Workstream id is required");
  if (fs.existsSync(workstreamPath(id))) {
    throw new Error(`Workstream "${id}" already exists`);
  }
  return writeWorkstream({ ...input, id });
}

export function updateWorkstream(
  id: string,
  input: Omit<WorkstreamInput, "id"> & { id?: string },
): WorkstreamDef {
  const existing = getWorkstream(id);
  if (!existing) throw new Error("Workstream not found");
  const nextId = slugId(input.id ?? id);
  if (!nextId) throw new Error("Workstream id is required");

  if (nextId !== id) {
    if (fs.existsSync(workstreamPath(nextId))) {
      throw new Error(`Workstream "${nextId}" already exists`);
    }
    const written = writeWorkstream({ ...input, id: nextId });
    fs.unlinkSync(existing.filePath);
    return written;
  }
  return writeWorkstream({ ...input, id });
}

export function deleteWorkstream(id: string) {
  assertSafeId(id, "workstream id");
  const existing = getWorkstream(id);
  if (!existing) throw new Error("Workstream not found");
  if (id === "feature") throw new Error("Cannot delete the default feature workstream");
  assertPathInside(WORKSTREAMS_DIR, existing.filePath, "workstream file");
  fs.unlinkSync(existing.filePath);
}
