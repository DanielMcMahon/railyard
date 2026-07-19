import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { AGENTS_DIR, ensureDirs } from "./paths";
import type { AgentDef, RuntimeKind } from "./types";
import { listColumns, removeAgentColumn } from "./board";
import { updateStore } from "./db";
import { assertPathInside, assertSafeId } from "./security";

export type AgentInput = {
  id: string;
  name: string;
  runtime: RuntimeKind;
  model: string;
  autonomous: boolean;
  color: string;
  prompt: string;
  canSpawn?: boolean;
};

function slugId(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function agentPath(id: string) {
  ensureDirs();
  const safe = assertSafeId(id, "agent id");
  const filePath = path.join(AGENTS_DIR, `${safe}.md`);
  const dir = fs.realpathSync(AGENTS_DIR);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(dir + path.sep) && path.dirname(resolved) !== dir) {
    throw new Error("Invalid agent path");
  }
  return resolved;
}

function parseAgentFile(filePath: string): AgentDef {
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  return {
    id: String(data.id ?? path.basename(filePath, ".md")),
    name: String(data.name ?? path.basename(filePath, ".md")),
    runtime: (data.runtime as RuntimeKind) ?? "cursor",
    model: String(data.model ?? "composer-2.5"),
    autonomous: data.autonomous !== false,
    color: String(data.color ?? "#5c6b73"),
    prompt: content.trim(),
    filePath,
    canSpawn: data.canSpawn === true,
  };
}

export function listAgents(): AgentDef[] {
  ensureDirs();
  if (!fs.existsSync(AGENTS_DIR)) return [];
  return fs
    .readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((file) => parseAgentFile(path.join(AGENTS_DIR, file)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getAgent(id: string) {
  if (!id || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)) {
    return listAgents().find((a) => a.id === id) ?? null;
  }
  try {
    const filePath = agentPath(id);
    if (fs.existsSync(filePath)) return parseAgentFile(filePath);
  } catch {
    /* invalid id */
  }
  return listAgents().find((a) => a.id === id) ?? null;
}

export function writeAgent(input: AgentInput): AgentDef {
  ensureDirs();
  const id = slugId(input.id);
  if (!id) throw new Error("Agent id is required");
  const filePath = agentPath(id);
  const front = {
    id,
    name: input.name.trim() || id,
    runtime: input.runtime,
    model: input.model.trim() || "composer-2.5",
    autonomous: input.autonomous,
    color: input.color || "#5c6b73",
    canSpawn: input.canSpawn === true,
  };
  const body = (input.prompt || "").trim() + "\n";
  fs.writeFileSync(filePath, matter.stringify(body, front), "utf8");
  return parseAgentFile(filePath);
}

export function createAgent(input: AgentInput): AgentDef {
  const id = slugId(input.id);
  if (!id) throw new Error("Agent id is required");
  if (fs.existsSync(agentPath(id))) throw new Error(`Agent "${id}" already exists`);
  return writeAgent({ ...input, id });
}

export function updateAgent(id: string, input: Omit<AgentInput, "id"> & { id?: string }): AgentDef {
  const existing = getAgent(id);
  if (!existing) throw new Error("Agent not found");
  const nextId = slugId(input.id ?? id);
  if (!nextId) throw new Error("Agent id is required");

  // Rename file if id changed
  if (nextId !== id) {
    if (fs.existsSync(agentPath(nextId))) throw new Error(`Agent "${nextId}" already exists`);
    const written = writeAgent({ ...input, id: nextId });
    fs.unlinkSync(existing.filePath);
    updateStore((s) => {
      for (const c of s.columns) {
        if (c.agent_id === id) {
          c.agent_id = nextId;
          c.title = written.name;
        }
      }
    });
    return written;
  }

  return writeAgent({ ...input, id });
}

export function deleteAgent(id: string) {
  assertSafeId(id, "agent id");
  const existing = getAgent(id);
  if (!existing) throw new Error("Agent not found");
  // Ensure unlink target is still under AGENTS_DIR
  assertPathInside(AGENTS_DIR, existing.filePath, "agent file");
  // Remove any board columns for this agent (tickets move to inbox)
  for (const col of listColumns().filter((c) => c.agentId === id)) {
    if (col.locked) {
      throw new Error(`Unlock column "${col.title}" before deleting this agent`);
    }
    removeAgentColumn(col.id);
  }
  fs.unlinkSync(existing.filePath);
}
