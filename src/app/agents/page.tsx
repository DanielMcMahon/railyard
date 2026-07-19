"use client";

import dynamic from "next/dynamic";

const AgentsApp = dynamic(() => import("@/components/AgentsApp").then((m) => m.AgentsApp), {
  ssr: false,
  loading: () => <div className="p-8 text-sm opacity-60">Loading agents…</div>,
});

export default function AgentsPage() {
  return <AgentsApp />;
}
