import { getConnector } from "./connectors";
import { getSettings } from "./db";
import { assertSafeOutboundUrl } from "./security";
import type { TicketRow } from "./types";

export type AdoWorkItem = {
  id: string;
  title: string;
  description: string;
  labels: string[];
  workstreamId?: string;
  commentCount?: number;
};

function adoBase(org: string, project: string, baseUrl: string) {
  const root = (baseUrl || "https://dev.azure.com").replace(/\/$/, "");
  return `${root}/${encodeURIComponent(org)}/${encodeURIComponent(project)}`;
}

/** Import work items via WIQL when ADO connector is enabled; otherwise demo items. */
export async function importAdoWorkItems(opts?: {
  org?: string;
  project?: string;
  query?: string;
}): Promise<{ items: AdoWorkItem[]; mode: "live" | "demo"; error?: string }> {
  const settings = getSettings();
  const connector = getConnector("ado");
  const org = opts?.org || connector?.config.org || settings.adoOrg;
  const project = opts?.project || connector?.config.project || settings.adoProject;
  const query =
    opts?.query || connector?.config.query || settings.adoQuery || "Select [System.Id] From WorkItems";
  const pat = connector?.apiKey || "";
  const enabled = connector?.enabled && Boolean(pat && org && project);

  if (!enabled) {
    return {
      mode: "demo",
      items: [
        {
          id: `demo-${Date.now().toString(36)}`,
          title: "Demo ADO work item",
          description: "## Description\n\nImported in demo mode (enable ADO connector + PAT for live).\n",
          labels: ["ado", "imported"],
          workstreamId: settings.activeWorkstreamId || "feature",
          commentCount: 0,
        },
      ],
    };
  }

  try {
    const base = adoBase(org, project, connector!.baseUrl);
    assertSafeOutboundUrl(base, "ADO base");
    const auth = Buffer.from(`:${pat}`).toString("base64");
    const wiqlRes = await fetch(`${base}/_apis/wit/wiql?api-version=7.1`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });
    if (!wiqlRes.ok) {
      const text = await wiqlRes.text();
      return { mode: "live", items: [], error: `WIQL ${wiqlRes.status}: ${text.slice(0, 200)}` };
    }
    const wiql = (await wiqlRes.json()) as { workItems?: Array<{ id: number }> };
    const ids = (wiql.workItems || []).slice(0, 25).map((w) => w.id);
    if (!ids.length) return { mode: "live", items: [] };

    const batchRes = await fetch(
      `${base}/_apis/wit/workitems?ids=${ids.join(",")}&$expand=All&api-version=7.1`,
      { headers: { Authorization: `Basic ${auth}` } },
    );
    if (!batchRes.ok) {
      return { mode: "live", items: [], error: `Work items ${batchRes.status}` };
    }
    const batch = (await batchRes.json()) as {
      value?: Array<{
        id: number;
        fields?: Record<string, unknown>;
      }>;
    };
    const items: AdoWorkItem[] = (batch.value || []).map((w) => {
      const fields = w.fields || {};
      const tags = String(fields["System.Tags"] || "")
        .split(";")
        .map((t) => t.trim())
        .filter(Boolean);
      const wsLabel = tags.find((t) => t.startsWith("workstream:"));
      return {
        id: String(w.id),
        title: String(fields["System.Title"] || `WI ${w.id}`),
        description: String(fields["System.Description"] || ""),
        labels: ["ado", ...tags.filter((t) => !t.startsWith("workstream:"))],
        workstreamId: wsLabel?.replace("workstream:", "") || settings.activeWorkstreamId,
        commentCount: 0,
      };
    });
    return { mode: "live", items };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { mode: "live", items: [], error: message };
  }
}

/** Write-back comment + optional state on Approve. Soft-fails. */
export async function writeBackAdo(ticket: TicketRow, note: string): Promise<string> {
  const settings = getSettings();
  if (!settings.adoWriteBack) return "ADO write-back disabled";
  if (!ticket.adoId) return "No adoId on ticket — skipped write-back";

  const connector = getConnector("ado");
  const org = connector?.config.org || settings.adoOrg;
  const project = connector?.config.project || settings.adoProject;
  const pat = connector?.apiKey || "";

  if (settings.demoMode || !connector?.enabled || !pat || !org || !project) {
    return `Demo/stub ADO write-back for #${ticket.adoId}: ${note.slice(0, 120)}`;
  }

  try {
    const base = adoBase(org, project, connector.baseUrl);
    assertSafeOutboundUrl(base, "ADO base");
    const auth = Buffer.from(`:${pat}`).toString("base64");
    const res = await fetch(
      `${base}/_apis/wit/workitems/${encodeURIComponent(ticket.adoId)}?api-version=7.1`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json-patch+json",
        },
        body: JSON.stringify([
          {
            op: "add",
            path: "/fields/System.History",
            value: note,
          },
        ]),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      return `ADO write-back failed ${res.status}: ${text.slice(0, 200)}`;
    }
    return `ADO write-back ok for #${ticket.adoId}`;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
