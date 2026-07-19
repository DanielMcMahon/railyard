"use client";

import { useId, useMemo } from "react";
import type { WorkstreamDef } from "@/lib/types";
import { stagesToGraph } from "@/lib/workflow/graph";
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "@/lib/workflow/types";

type Props = {
  workstream: Pick<
    WorkstreamDef,
    | "id"
    | "name"
    | "stages"
    | "defaultOnFailureAgentId"
    | "onRequestChangesAgentId"
  >;
  /** agentId → display name */
  agentNames?: Record<string, string>;
  accent?: string;
  compact?: boolean;
  className?: string;
};

const DISPLAY_CONDITIONS = new Set([
  "always",
  "success",
  "failure",
  "manual",
  "validation_pass",
  "validation_fail",
]);

function nodeLabel(node: WorkflowNode, agentNames?: Record<string, string>): string {
  if (node.type === "start") return "START";
  if (node.type === "end") return "END";
  if (node.type === "human") {
    return node.configuration.gate === "needs_human" ? "Needs human" : "Review";
  }
  if (node.type === "agent") {
    const id = String(node.configuration.agentId || node.name);
    return agentNames?.[id] || id;
  }
  if (node.type === "validator") {
    return `✓ ${String(node.configuration.title || node.name)}`;
  }
  if (node.type === "command") {
    return `⌘ ${String(node.configuration.title || node.name)}`;
  }
  return node.name;
}

function edgeLabel(condition: string): string {
  switch (condition) {
    case "always":
      return "";
    case "success":
    case "validation_pass":
      return "ok";
    case "failure":
    case "validation_fail":
      return "fail";
    case "manual":
      return "approve";
    default:
      return condition;
  }
}

/** Walk success/always spine from start for vertical layout order. */
function spineOrder(graph: WorkflowGraph): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  let cur = graph.nodes.find((n) => n.type === "start")?.id;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    order.push(cur);
    const next =
      graph.edges.find(
        (e) =>
          e.from === cur &&
          (e.condition === "always" ||
            e.condition === "success" ||
            e.condition === "validation_pass" ||
            e.condition === "manual"),
      )?.to || null;
    cur = next || undefined;
  }
  // Append any remaining executable / human nodes not on spine
  for (const n of graph.nodes) {
    if (!seen.has(n.id) && n.type !== "human") {
      // skip needs_human unless referenced
      continue;
    }
    if (!seen.has(n.id) && n.id === "human:needs") continue;
  }
  return order;
}

function nodeTone(node: WorkflowNode): {
  fill: string;
  stroke: string;
  text: string;
} {
  switch (node.type) {
    case "start":
    case "end":
      return { fill: "#14212b", stroke: "#14212b", text: "#f3eee6" };
    case "human":
      return { fill: "#f7efe0", stroke: "#c45c26", text: "#14212b" };
    case "validator":
      return { fill: "#e8f2ee", stroke: "#2f6f5e", text: "#14212b" };
    case "command":
      return { fill: "#eef1f5", stroke: "#3d5a80", text: "#14212b" };
    default:
      return { fill: "#ffffff", stroke: "rgba(20,33,43,0.28)", text: "#14212b" };
  }
}

/**
 * SVG flow diagram of a workstream graph (happy path + failure / review edges).
 */
export function WorkflowFlowDiagram({
  workstream,
  agentNames,
  accent = "#3d5a80",
  compact = false,
  className = "",
}: Props) {
  const uid = useId().replace(/:/g, "");
  const markerOk = `arrow-ok-${uid}`;
  const markerFail = `arrow-fail-${uid}`;
  const markerManual = `arrow-manual-${uid}`;

  const layout = useMemo(() => {
    const full: WorkstreamDef = {
      id: workstream.id || "draft",
      name: workstream.name || "Draft",
      kind: "pipeline",
      color: accent,
      stages: workstream.stages || [],
      git: true,
      completeAction: "note_only",
      defaultLabels: [],
      trigger: null,
      defaultOnFailureAgentId: workstream.defaultOnFailureAgentId || null,
      onRequestChangesAgentId: workstream.onRequestChangesAgentId || null,
      notes: "",
      filePath: "",
    };
    const graph = stagesToGraph(full);
    const order = spineOrder(graph);
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));

    const nodeW = compact ? 112 : 148;
    const nodeH = compact ? 28 : 36;
    const gapY = compact ? 44 : 58;
    const padX = compact ? 56 : 88;
    const padY = compact ? 16 : 24;
    const cx = padX + nodeW / 2 + (compact ? 40 : 70);

    const positions = new Map<string, { x: number; y: number; node: WorkflowNode }>();
    order.forEach((id, i) => {
      const node = byId.get(id);
      if (!node) return;
      positions.set(id, {
        x: cx - nodeW / 2,
        y: padY + i * gapY,
        node,
      });
    });

    const needsReferenced = graph.edges.some(
      (e) => e.to === "human:needs" && DISPLAY_CONDITIONS.has(e.condition),
    );
    const needs = byId.get("human:needs");
    if (needs && needsReferenced && !positions.has("human:needs")) {
      const midY = padY + Math.max(0, (order.length - 1) * 0.45) * gapY;
      positions.set("human:needs", {
        x: cx + nodeW / 2 + (compact ? 28 : 48),
        y: midY,
        node: needs,
      });
    }

    const visibleEdges = graph.edges.filter((e) => {
      if (!DISPLAY_CONDITIONS.has(e.condition)) return false;
      if (e.condition === "validation_pass" || e.condition === "validation_fail") {
        const alias = e.condition === "validation_pass" ? "success" : "failure";
        if (
          graph.edges.some(
            (o) => o.from === e.from && o.to === e.to && o.condition === alias,
          )
        ) {
          return false;
        }
      }
      return positions.has(e.from) && positions.has(e.to);
    });

    const xs = [...positions.values()].map((p) => p.x + nodeW);
    const ys = [...positions.values()].map((p) => p.y + nodeH);
    const maxX = xs.length ? Math.max(...xs) : cx + nodeW;
    const maxY = ys.length ? Math.max(...ys) : padY;
    return {
      nodes: [...positions.entries()].map(([id, p]) => ({ id, ...p })),
      edges: visibleEdges,
      width: maxX + padX,
      height: maxY + padY + 8,
      positions,
      nodeW,
      nodeH,
    };
  }, [
    workstream.id,
    workstream.name,
    workstream.stages,
    workstream.defaultOnFailureAgentId,
    workstream.onRequestChangesAgentId,
    accent,
    compact,
  ]);

  const { nodes, edges, width, height, positions, nodeW, nodeH } = layout;

  if (!workstream.stages?.length) {
    return (
      <div
        className={`rounded-lg border border-dashed border-[var(--rail-line)] px-3 py-4 text-center text-xs opacity-50 ${className}`}
      >
        No stages yet — add agents to see the flow.
      </div>
    );
  }

  return (
    <div
      className={`overflow-x-auto rounded-lg border border-[var(--rail-line)] bg-[rgba(20,33,43,0.03)] ${className}`}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Workflow graph for ${workstream.name || workstream.id}`}
        className="block max-w-full"
      >
        <defs>
          <marker
            id={markerOk}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(20,33,43,0.55)" />
          </marker>
          <marker
            id={markerFail}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#c45c26" />
          </marker>
          <marker
            id={markerManual}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={accent} />
          </marker>
        </defs>

        {edges.map((e, i) => (
          <EdgePath
            key={`${e.from}-${e.to}-${e.condition}-${i}`}
            edge={e}
            from={positions.get(e.from)!}
            to={positions.get(e.to)!}
            nodeW={nodeW}
            nodeH={nodeH}
            compact={compact}
            accent={accent}
            markerOk={`url(#${markerOk})`}
            markerFail={`url(#${markerFail})`}
            markerManual={`url(#${markerManual})`}
          />
        ))}

        {nodes.map(({ id, x, y, node }) => {
          const tone = nodeTone(node);
          const label = nodeLabel(node, agentNames);
          const r = node.type === "start" || node.type === "end" ? nodeH / 2 : 8;
          return (
            <g key={id} transform={`translate(${x},${y})`}>
              <rect
                width={nodeW}
                height={nodeH}
                rx={r}
                ry={r}
                fill={tone.fill}
                stroke={node.type === "agent" ? accent : tone.stroke}
                strokeWidth={node.type === "agent" ? 1.75 : 1.25}
              />
              <text
                x={nodeW / 2}
                y={nodeH / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={tone.text}
                fontSize={compact ? 10 : 11}
                fontFamily="var(--font-mono), ui-monospace, monospace"
                fontWeight={node.type === "start" || node.type === "end" ? 600 : 500}
              >
                {truncate(label, compact ? 14 : 18)}
              </text>
            </g>
          );
        })}
      </svg>
      {!compact && (
        <div className="flex flex-wrap gap-3 border-t border-[var(--rail-line)] px-3 py-1.5 text-[10px] uppercase tracking-wide opacity-55">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-[rgba(20,33,43,0.45)]" /> ok / next
          </span>
          <span className="inline-flex items-center gap-1 text-[var(--rail-signal)]">
            <span className="inline-block h-0.5 w-4 border-t border-dashed border-[var(--rail-signal)]" />{" "}
            fail
          </span>
          <span className="inline-flex items-center gap-1" style={{ color: accent }}>
            <span className="inline-block h-0.5 w-4" style={{ background: accent }} /> approve
          </span>
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function EdgePath(props: {
  edge: WorkflowEdge;
  from: { x: number; y: number };
  to: { x: number; y: number };
  nodeW: number;
  nodeH: number;
  compact: boolean;
  accent: string;
  markerOk: string;
  markerFail: string;
  markerManual: string;
}) {
  const {
    edge,
    from,
    to,
    nodeW,
    nodeH,
    compact,
    accent,
    markerOk,
    markerFail,
    markerManual,
  } = props;
  const isFail = edge.condition === "failure" || edge.condition === "validation_fail";
  const isManual = edge.condition === "manual";
  const label = edgeLabel(edge.condition);

  const x1 = from.x + nodeW / 2;
  const y1 = from.y + nodeH;
  const x2 = to.x + nodeW / 2;
  const y2 = to.y;

  const sameColumn = Math.abs(from.x - to.x) < 4;
  const goingDown = to.y >= from.y;
  const goingBack = to.y < from.y - 2;

  let d: string;
  let labelX: number;
  let labelY: number;

  if (isFail || goingBack || !sameColumn) {
    const midY = (from.y + to.y + nodeH) / 2;
    const left = Math.min(from.x, to.x) - (compact ? 18 : 28);
    if (goingBack || isFail) {
      d = `M ${from.x} ${from.y + nodeH / 2} C ${left} ${from.y + nodeH / 2}, ${left} ${to.y + nodeH / 2}, ${to.x} ${to.y + nodeH / 2}`;
      labelX = left - 2;
      labelY = midY;
    } else {
      const bulge = compact ? 40 : 56;
      d = `M ${x1} ${from.y + nodeH / 2} C ${x1 + bulge} ${from.y + nodeH / 2}, ${x2 + bulge} ${to.y + nodeH / 2}, ${x2} ${to.y + nodeH / 2}`;
      labelX = Math.max(x1, x2) + bulge / 2;
      labelY = midY;
    }
  } else if (goingDown) {
    d = `M ${x1} ${y1} L ${x2} ${y2}`;
    labelX = x1 + 10;
    labelY = (y1 + y2) / 2;
  } else {
    d = `M ${x1} ${from.y} L ${x2} ${to.y + nodeH}`;
    labelX = x1 + 10;
    labelY = (from.y + to.y + nodeH) / 2;
  }

  const stroke = isFail ? "#c45c26" : isManual ? accent : "rgba(20,33,43,0.4)";
  const marker = isFail ? markerFail : isManual ? markerManual : markerOk;

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={isFail ? 1.5 : 1.35}
        strokeDasharray={isFail ? "5 4" : undefined}
        markerEnd={marker}
      />
      {label && !compact && (
        <text
          x={labelX}
          y={labelY}
          fill={isFail ? "#c45c26" : "rgba(20,33,43,0.55)"}
          fontSize={9}
          fontFamily="var(--font-mono), ui-monospace, monospace"
          textAnchor={isFail || goingBack ? "end" : "start"}
          dominantBaseline="middle"
        >
          {label}
        </text>
      )}
    </g>
  );
}
