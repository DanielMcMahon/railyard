import fs from "fs";
import path from "path";
import { DATA_DIR, ensureDirs } from "./paths";
import type { ProviderConfig, ProviderPublic, RuntimeKind } from "./types";
import { assertOptionalOutboundUrl, assertSafeOutboundUrl } from "./security";

const PROVIDERS_PATH = path.join(DATA_DIR, "providers.json");

const BUILTIN: Omit<ProviderConfig, "apiKey">[] = [
  {
    id: "cursor",
    name: "Cursor",
    kind: "cursor",
    enabled: true,
    baseUrl: "https://api.cursor.com",
    defaultModel: "composer-2.5",
    notes: "CURSOR_API_KEY for SDK / cloud agents",
  },
  {
    id: "opencode",
    name: "OpenCode Go",
    kind: "opencode",
    enabled: true,
    baseUrl: "https://opencode.ai/zen/go/v1",
    defaultModel: "opencode-go/deepseek-v4-flash",
    notes:
      "OpenCode Go subscription key from https://opencode.ai/zen (API Keys). Models use opencode-go/<id>. Chat completions: …/v1/chat/completions",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    kind: "deepseek",
    enabled: false,
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-v4-flash",
    notes: "OpenAI-compatible. Often used under OpenCode.",
  },
  {
    id: "copilot",
    name: "GitHub Copilot CLI",
    kind: "copilot",
    enabled: false,
    baseUrl: "",
    defaultModel: "",
    notes: "Uses gh auth / COPILOT token. YOLO via --yolo when wired.",
  },
  {
    id: "openai",
    name: "OpenAI-compatible",
    kind: "openai_compatible",
    enabled: false,
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1",
    notes: "Any OpenAI-compatible endpoint (Azure OpenAI, gateways, etc.)",
  },
];

type StoreFile = { providers: ProviderConfig[] };

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 4) return "••••";
  return `••••${key.slice(-4)}`;
}

function emptyKeys(list: Omit<ProviderConfig, "apiKey">[]): ProviderConfig[] {
  return list.map((p) => ({ ...p, apiKey: "" }));
}

function readRaw(): StoreFile {
  ensureDirs();
  if (!fs.existsSync(PROVIDERS_PATH)) {
    const initial: StoreFile = { providers: emptyKeys(BUILTIN) };
    fs.writeFileSync(PROVIDERS_PATH, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }
  const parsed = JSON.parse(fs.readFileSync(PROVIDERS_PATH, "utf8")) as StoreFile;
  // Merge any missing builtins
  const byId = new Map(parsed.providers.map((p) => [p.id, p]));
  for (const b of BUILTIN) {
    if (!byId.has(b.id)) {
      byId.set(b.id, { ...b, apiKey: "" });
    }
  }
  return { providers: Array.from(byId.values()) };
}

function writeRaw(store: StoreFile) {
  ensureDirs();
  fs.writeFileSync(PROVIDERS_PATH, JSON.stringify(store, null, 2), "utf8");
}

export function listProvidersPublic(): ProviderPublic[] {
  return readRaw().providers.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    enabled: p.enabled,
    baseUrl: p.baseUrl,
    defaultModel: p.defaultModel,
    notes: p.notes,
    hasApiKey: Boolean(p.apiKey),
    apiKeyMasked: maskKey(p.apiKey),
  }));
}

export function getProvider(id: string): ProviderConfig | null {
  return readRaw().providers.find((p) => p.id === id) ?? null;
}

/** Full config including apiKey — server-side only. */
export function getProviderSecret(id: string): ProviderConfig | null {
  return getProvider(id);
}

export function upsertProvider(
  input: Partial<ProviderConfig> & { id: string },
  opts?: { replaceApiKey?: boolean },
): ProviderPublic {
  const store = readRaw();
  const idx = store.providers.findIndex((p) => p.id === input.id);
  const existing = idx >= 0 ? store.providers[idx] : null;

  const baseUrlRaw = input.baseUrl ?? existing?.baseUrl ?? "";
  const next: ProviderConfig = {
    id: input.id,
    name: input.name ?? existing?.name ?? input.id,
    kind: input.kind ?? existing?.kind ?? "openai_compatible",
    enabled: input.enabled ?? existing?.enabled ?? true,
    baseUrl: baseUrlRaw ? assertOptionalOutboundUrl(baseUrlRaw, "provider baseUrl") : "",
    defaultModel: input.defaultModel ?? existing?.defaultModel ?? "",
    notes: input.notes ?? existing?.notes ?? "",
    apiKey: existing?.apiKey ?? "",
  };

  if (opts?.replaceApiKey && typeof input.apiKey === "string") {
    const trimmed = input.apiKey.trim();
    // Ignore masked placeholders sent back from the UI
    if (trimmed && !trimmed.startsWith("••••")) {
      next.apiKey = trimmed;
    } else if (trimmed === "") {
      next.apiKey = "";
    }
  }

  if (idx >= 0) store.providers[idx] = next;
  else store.providers.push(next);

  writeRaw(store);
  return listProvidersPublic().find((p) => p.id === next.id)!;
}

export function deleteProvider(id: string) {
  if (BUILTIN.some((b) => b.id === id)) {
    throw new Error("Built-in providers cannot be deleted — disable them instead");
  }
  const store = readRaw();
  store.providers = store.providers.filter((p) => p.id !== id);
  writeRaw(store);
}

export function createCustomProvider(input: {
  id: string;
  name: string;
  baseUrl?: string;
  defaultModel?: string;
  apiKey?: string;
  notes?: string;
}): ProviderPublic {
  const id = input.id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  if (!id) throw new Error("id required");
  if (getProvider(id)) throw new Error(`Provider "${id}" already exists`);
  return upsertProvider(
    {
      id,
      name: input.name || id,
      kind: "openai_compatible",
      enabled: true,
      baseUrl: input.baseUrl || "",
      defaultModel: input.defaultModel || "",
      notes: input.notes || "",
      apiKey: input.apiKey || "",
    },
    { replaceApiKey: true },
  );
}

/** Map runtime kind → preferred provider id for orchestrator. */
export function providerIdForRuntime(runtime: RuntimeKind | string): string {
  if (runtime === "demo") return "demo";
  if (runtime === "cursor") return "cursor";
  if (runtime === "opencode") return "opencode";
  if (runtime === "copilot") return "copilot";
  // Custom provider ids pass through
  if (getProvider(runtime)) return runtime;
  return "cursor";
}

export type ModelOption = { id: string; name: string };

const CURSOR_MODELS: ModelOption[] = [
  { id: "composer-2.5", name: "composer-2.5" },
  { id: "composer-2", name: "composer-2" },
  { id: "gpt-5.5", name: "gpt-5.5" },
  { id: "claude-opus-4.6", name: "claude-opus-4.6" },
];

const DEEPSEEK_MODELS: ModelOption[] = [
  { id: "deepseek-v4-flash", name: "deepseek-v4-flash" },
  { id: "deepseek-v4-pro", name: "deepseek-v4-pro" },
];

const COPILOT_MODELS: ModelOption[] = [
  { id: "gpt-5.2", name: "gpt-5.2" },
  { id: "claude-sonnet-4.5", name: "claude-sonnet-4.5" },
];

/** Models available for a provider (for Settings / Agents dropdowns). */
export async function listModelsForProvider(providerId: string): Promise<ModelOption[]> {
  if (providerId === "demo") {
    return [{ id: "demo", name: "demo (simulated)" }];
  }

  const provider = getProvider(providerId);
  if (!provider) {
    return [{ id: "demo", name: "demo (simulated)" }];
  }

  if (provider.kind === "cursor") {
    return ensureDefaultInList(CURSOR_MODELS, provider.defaultModel);
  }
  if (provider.kind === "copilot") {
    return ensureDefaultInList(COPILOT_MODELS, provider.defaultModel);
  }
  if (provider.kind === "deepseek") {
    return ensureDefaultInList(DEEPSEEK_MODELS, provider.defaultModel);
  }

  if (provider.kind === "opencode") {
    try {
      const models = await fetchOpenCodeGoModels(provider);
      return ensureDefaultInList(models, provider.defaultModel);
    } catch {
      return ensureDefaultInList(
        [
          { id: "opencode-go/deepseek-v4-flash", name: "opencode-go/deepseek-v4-flash" },
          { id: "opencode-go/deepseek-v4-pro", name: "opencode-go/deepseek-v4-pro" },
          { id: "opencode-go/kimi-k3", name: "opencode-go/kimi-k3" },
          { id: "opencode-go/glm-5.2", name: "opencode-go/glm-5.2" },
        ],
        provider.defaultModel,
      );
    }
  }

  // openai_compatible / custom — try /models, else just the stored default
  if (provider.baseUrl) {
    try {
      const models = await fetchOpenAICompatibleModels(provider);
      if (models.length) return ensureDefaultInList(models, provider.defaultModel);
    } catch {
      /* fall through */
    }
  }
  return ensureDefaultInList(
    provider.defaultModel ? [{ id: provider.defaultModel, name: provider.defaultModel }] : [],
    provider.defaultModel,
  );
}

function ensureDefaultInList(list: ModelOption[], defaultModel: string): ModelOption[] {
  if (!defaultModel) return list;
  if (list.some((m) => m.id === defaultModel)) return list;
  return [{ id: defaultModel, name: defaultModel }, ...list];
}

async function fetchOpenCodeGoModels(provider: ProviderConfig): Promise<ModelOption[]> {
  const base = (provider.baseUrl || "https://opencode.ai/zen/go/v1").replace(/\/$/, "");
  assertSafeOutboundUrl(base, "OpenCode baseUrl");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  const res = await fetch(`${base}/models`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!res.ok) throw new Error(`models ${res.status}`);
  const json = (await res.json()) as { data?: Array<{ id: string }> };
  const rows = json.data ?? [];
  return rows.map((m) => {
    const id = m.id.startsWith("opencode-go/") ? m.id : `opencode-go/${m.id}`;
    return { id, name: id };
  });
}

async function fetchOpenAICompatibleModels(provider: ProviderConfig): Promise<ModelOption[]> {
  const base = provider.baseUrl.replace(/\/$/, "");
  assertSafeOutboundUrl(base, "provider baseUrl");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  const res = await fetch(`${base}/models`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!res.ok) throw new Error(`models ${res.status}`);
  const json = (await res.json()) as { data?: Array<{ id: string }> };
  return (json.data ?? []).map((m) => ({ id: m.id, name: m.id }));
}

/** Enabled providers (+ demo) for the Settings runtime dropdown. */
export function listRuntimeOptions(): Array<{ id: string; name: string }> {
  const enabled = listProvidersPublic()
    .filter((p) => p.enabled)
    .map((p) => ({ id: p.id, name: p.name }));
  return [{ id: "demo", name: "Demo (no API)" }, ...enabled];
}
