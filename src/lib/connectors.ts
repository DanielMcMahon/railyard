import fs from "fs";
import path from "path";
import { DATA_DIR, ensureDirs } from "./paths";
import type { ConnectorConfig, ConnectorKind, ConnectorPublic } from "./types";
import { assertOptionalOutboundUrl } from "./security";

const CONNECTORS_PATH = path.join(DATA_DIR, "connectors.json");

const BUILTIN: Omit<ConnectorConfig, "apiKey">[] = [
  {
    id: "ado",
    name: "Azure DevOps",
    kind: "ado",
    enabled: false,
    baseUrl: "https://dev.azure.com",
    config: { org: "", project: "", query: "" },
    notes: "Import work items as local markdown tickets. PAT goes in API key.",
  },
  {
    id: "trello",
    name: "Trello",
    kind: "trello",
    enabled: false,
    baseUrl: "https://api.trello.com/1",
    config: { boardId: "", listId: "" },
    notes: "API key + token. Board/list IDs in config.",
  },
  {
    id: "github",
    name: "GitHub Issues",
    kind: "github",
    enabled: false,
    baseUrl: "https://api.github.com",
    config: { owner: "", repo: "", labels: "" },
    notes: "Personal access token. Import issues as local tickets.",
  },
  {
    id: "linear",
    name: "Linear",
    kind: "linear",
    enabled: false,
    baseUrl: "https://api.linear.app/graphql",
    config: { teamId: "" },
    notes: "API key. Import issues as local tickets.",
  },
];

type StoreFile = { connectors: ConnectorConfig[] };

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 4) return "••••";
  return `••••${key.slice(-4)}`;
}

function readRaw(): StoreFile {
  ensureDirs();
  if (!fs.existsSync(CONNECTORS_PATH)) {
    const initial: StoreFile = {
      connectors: BUILTIN.map((c) => ({ ...c, apiKey: "" })),
    };
    fs.writeFileSync(CONNECTORS_PATH, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }
  const parsed = JSON.parse(fs.readFileSync(CONNECTORS_PATH, "utf8")) as StoreFile;
  const byId = new Map(parsed.connectors.map((c) => [c.id, c]));
  for (const b of BUILTIN) {
    if (!byId.has(b.id)) byId.set(b.id, { ...b, apiKey: "" });
  }
  // Migrate ADO fields from board settings if present and ado connector empty
  return { connectors: Array.from(byId.values()) };
}

function writeRaw(store: StoreFile) {
  ensureDirs();
  fs.writeFileSync(CONNECTORS_PATH, JSON.stringify(store, null, 2), "utf8");
}

export function listConnectorsPublic(): ConnectorPublic[] {
  return readRaw().connectors.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    enabled: c.enabled,
    baseUrl: c.baseUrl,
    config: c.config,
    notes: c.notes,
    hasApiKey: Boolean(c.apiKey),
    apiKeyMasked: maskKey(c.apiKey),
  }));
}

export function getConnector(id: string): ConnectorConfig | null {
  return readRaw().connectors.find((c) => c.id === id) ?? null;
}

export function upsertConnector(
  input: Partial<ConnectorConfig> & { id: string },
  opts?: { replaceApiKey?: boolean },
): ConnectorPublic {
  const store = readRaw();
  const idx = store.connectors.findIndex((c) => c.id === input.id);
  const existing = idx >= 0 ? store.connectors[idx] : null;
  const baseUrlRaw = input.baseUrl ?? existing?.baseUrl ?? "";
  const next: ConnectorConfig = {
    id: input.id,
    name: input.name ?? existing?.name ?? input.id,
    kind: (input.kind as ConnectorKind) ?? existing?.kind ?? "custom",
    enabled: input.enabled ?? existing?.enabled ?? true,
    baseUrl: baseUrlRaw ? assertOptionalOutboundUrl(baseUrlRaw, "connector baseUrl") : "",
    config: input.config ?? existing?.config ?? {},
    notes: input.notes ?? existing?.notes ?? "",
    apiKey: existing?.apiKey ?? "",
  };
  if (opts?.replaceApiKey && typeof input.apiKey === "string") {
    const trimmed = input.apiKey.trim();
    if (trimmed && !trimmed.startsWith("••••")) next.apiKey = trimmed;
    else if (trimmed === "") next.apiKey = "";
  }
  if (idx >= 0) store.connectors[idx] = next;
  else store.connectors.push(next);
  writeRaw(store);
  return listConnectorsPublic().find((c) => c.id === next.id)!;
}

export function createCustomConnector(input: {
  id: string;
  name: string;
  kind?: ConnectorKind;
  baseUrl?: string;
  config?: Record<string, string>;
  apiKey?: string;
  notes?: string;
}): ConnectorPublic {
  const id = input.id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  if (!id) throw new Error("id required");
  if (getConnector(id)) throw new Error(`Connector "${id}" already exists`);
  return upsertConnector(
    {
      id,
      name: input.name || id,
      kind: input.kind || "custom",
      enabled: true,
      baseUrl: input.baseUrl || "",
      config: input.config || {},
      notes: input.notes || "",
      apiKey: input.apiKey || "",
    },
    { replaceApiKey: true },
  );
}

export function deleteConnector(id: string) {
  if (BUILTIN.some((b) => b.id === id)) {
    throw new Error("Built-in connectors cannot be deleted — disable them instead");
  }
  const store = readRaw();
  store.connectors = store.connectors.filter((c) => c.id !== id);
  writeRaw(store);
}
