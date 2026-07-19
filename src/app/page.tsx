"use client";

import dynamic from "next/dynamic";

const BoardApp = dynamic(() => import("@/components/BoardApp").then((m) => m.BoardApp), {
  ssr: false,
  loading: () => (
    <div className="p-8 text-sm opacity-60" style={{ fontFamily: "var(--font-plex)" }}>
      Loading yard…
    </div>
  ),
});

export default function HomePage() {
  return <BoardApp />;
}
