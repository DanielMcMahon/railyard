"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 pb-10 pt-5 md:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--rail-line)] pb-4">
        <div>
          <p
            className="text-xs font-medium tracking-[0.22em] uppercase"
            style={{ fontFamily: "var(--font-mono)", color: "#5c6b73" }}
          >
            Dispatch
          </p>
          <h1
            className="text-4xl font-extrabold tracking-tight md:text-5xl"
            style={{ fontFamily: "var(--font-syne, var(--font-display))" }}
          >
            Railyard
          </h1>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          <NavLink href="/" active={pathname === "/"}>
            Board
          </NavLink>
          <NavLink href="/inbox" active={pathname.startsWith("/inbox")}>
            Inbox
          </NavLink>
          <NavLink href="/archive" active={pathname.startsWith("/archive")}>
            Archive
          </NavLink>
          <NavLink href="/agents" active={pathname.startsWith("/agents")}>
            Agents
          </NavLink>
          <NavLink href="/workstreams" active={pathname.startsWith("/workstreams")}>
            Workstreams
          </NavLink>
          <NavLink href="/jobs" active={pathname.startsWith("/jobs")}>
            Jobs
          </NavLink>
          <NavLink
            href="/settings"
            active={
              pathname.startsWith("/settings") ||
              pathname.startsWith("/providers") ||
              pathname.startsWith("/connectors")
            }
          >
            Settings
          </NavLink>
        </nav>
      </header>
      {children}
    </div>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-full px-4 py-2 text-sm font-medium transition"
      style={
        active
          ? { background: "#14212b", color: "#f3eee6" }
          : { background: "rgba(255,255,255,0.55)", color: "#14212b" }
      }
    >
      {children}
    </Link>
  );
}
