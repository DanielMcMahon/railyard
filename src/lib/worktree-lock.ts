import fs from "fs";
import path from "path";

/**
 * Best-effort advisory lock under the ticket worktree.
 * Prevents two parallel runners from claiming the same worktree.
 */
export function acquireWorktreeLock(
  worktreePath: string,
  ticketId: string,
): { ok: true; lockPath: string } | { ok: false; reason: string } {
  const lockPath = path.join(worktreePath, ".railyard-lock");
  try {
    if (fs.existsSync(lockPath)) {
      const raw = fs.readFileSync(lockPath, "utf8");
      const holder = JSON.parse(raw) as { ticketId?: string; pid?: number; at?: string };
      if (holder.ticketId && holder.ticketId !== ticketId) {
        // Stale lock if PID dead (best-effort)
        if (holder.pid && !isPidAlive(holder.pid)) {
          fs.unlinkSync(lockPath);
        } else {
          return {
            ok: false,
            reason: `Worktree locked by ticket ${holder.ticketId} (pid ${holder.pid})`,
          };
        }
      }
    }
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ ticketId, pid: process.pid, at: new Date().toISOString() }, null, 2),
      "utf8",
    );
    return { ok: true, lockPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[railyard-lock]", message);
    // Non-fatal — log and continue
    return { ok: true, lockPath };
  }
}

export function releaseWorktreeLock(worktreePath: string | null | undefined, ticketId: string) {
  if (!worktreePath) return;
  const lockPath = path.join(worktreePath, ".railyard-lock");
  try {
    if (!fs.existsSync(lockPath)) return;
    const raw = fs.readFileSync(lockPath, "utf8");
    const holder = JSON.parse(raw) as { ticketId?: string };
    if (holder.ticketId === ticketId || !holder.ticketId) {
      fs.unlinkSync(lockPath);
    }
  } catch (err) {
    console.warn("[railyard-lock] release failed", err);
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
