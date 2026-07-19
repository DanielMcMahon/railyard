"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const SettingsApp = dynamic(
  () => import("@/components/SettingsApp").then((m) => m.SettingsApp),
  {
    ssr: false,
    loading: () => (
      <div className="p-8 text-sm opacity-60">Loading settings…</div>
    ),
  },
);

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm opacity-60">Loading settings…</div>}>
      <SettingsApp />
    </Suspense>
  );
}
