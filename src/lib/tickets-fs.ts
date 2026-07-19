import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { randomUUID } from "crypto";
import { TICKETS_DIR, ensureDirs } from "./paths";

export function ticketFilePath(id: string) {
  return path.join(TICKETS_DIR, `${id}.md`);
}

export function writeTicketMarkdown(opts: {
  id: string;
  title: string;
  adoId?: string | null;
  body: string;
  labels?: string[];
  commentCount?: number;
}) {
  ensureDirs();
  const front = {
    adoId: opts.adoId ?? null,
    title: opts.title,
    labels: opts.labels ?? [],
    commentCount: opts.commentCount ?? 0,
    source: "local",
    externalId: opts.adoId ?? null,
  };
  const md = matter.stringify(opts.body.trim() + "\n", front);
  const filePath = ticketFilePath(opts.id);
  fs.writeFileSync(filePath, md, "utf8");
  return filePath;
}

export function readTicketMarkdown(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  return { data, content };
}

export function appendAgentNote(filePath: string, agentName: string, note: string) {
  const { data, content } = readTicketMarkdown(filePath);
  const block = `\n\n## Agent notes — ${agentName}\n\n${note.trim()}\n`;
  const next = content.includes("## Agent notes")
    ? `${content.trim()}\n\n### ${agentName}\n\n${note.trim()}\n`
    : `${content.trim()}${block}`;
  fs.writeFileSync(filePath, matter.stringify(next, data), "utf8");
}

export function updateTicketMarkdown(
  filePath: string,
  opts: {
    title?: string;
    body?: string;
    labels?: string[];
    adoId?: string | null;
    commentCount?: number;
    externalId?: string | null;
    source?: string | null;
    workstreamId?: string | null;
  },
) {
  const { data, content } = readTicketMarkdown(filePath);
  const nextData = {
    ...data,
    title: opts.title ?? data.title,
    labels: opts.labels ?? data.labels ?? [],
    adoId: opts.adoId !== undefined ? opts.adoId : data.adoId,
    commentCount: opts.commentCount ?? data.commentCount ?? 0,
    externalId: opts.externalId !== undefined ? opts.externalId : data.externalId,
    source: opts.source !== undefined ? opts.source : data.source,
    workstreamId:
      opts.workstreamId !== undefined ? opts.workstreamId : data.workstreamId,
  };
  const body = opts.body !== undefined ? opts.body : content;
  fs.writeFileSync(filePath, matter.stringify(body.trim() + "\n", nextData), "utf8");
}

export function deleteTicketFile(filePath: string) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export function createLocalTicketId() {
  return randomUUID();
}
