import { createHash } from "crypto";
import { getSettings, readStore } from "./db";
import { DEFAULT_USD_PER_1K_TOKENS } from "./types";

export function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil((text || "").length / 4));
}

export function estimateCostUsd(tokens: number, usdPer1k = DEFAULT_USD_PER_1K_TOKENS): number {
  return Math.round((tokens / 1000) * usdPer1k * 1_000_000) / 1_000_000;
}

export function promptHash(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}

export function sumTicketCostUsd(ticketId: string): number {
  return readStore()
    .runs.filter((r) => r.ticket_id === ticketId)
    .reduce((sum, r) => sum + (Number(r.estimated_cost_usd) || 0), 0);
}

export function sumDayCostUsd(dayIso = new Date().toISOString().slice(0, 10)): number {
  return readStore()
    .runs.filter((r) => (r.started_at || "").startsWith(dayIso))
    .reduce((sum, r) => sum + (Number(r.estimated_cost_usd) || 0), 0);
}

export type BudgetCheck =
  | { ok: true }
  | { ok: false; reason: string; ticketCost: number; dayCost: number };

/** Pure budget gate — used by checkBudget and workflow tests. */
export function evaluateBudgetLimits(opts: {
  budgetHardStop: boolean;
  ticketCost: number;
  dayCost: number;
  ticketLimit: number;
  dayLimit: number;
}): BudgetCheck {
  if (!opts.budgetHardStop) return { ok: true };
  if (opts.ticketLimit > 0 && opts.ticketCost >= opts.ticketLimit) {
    return {
      ok: false,
      reason: `Ticket budget exceeded ($${opts.ticketCost.toFixed(4)} >= $${opts.ticketLimit})`,
      ticketCost: opts.ticketCost,
      dayCost: opts.dayCost,
    };
  }
  if (opts.dayLimit > 0 && opts.dayCost >= opts.dayLimit) {
    return {
      ok: false,
      reason: `Daily budget exceeded ($${opts.dayCost.toFixed(4)} >= $${opts.dayLimit})`,
      ticketCost: opts.ticketCost,
      dayCost: opts.dayCost,
    };
  }
  return { ok: true };
}

/** Hard-stop check before launching a new run. */
export function checkBudget(ticketId: string): BudgetCheck {
  const settings = getSettings();
  return evaluateBudgetLimits({
    budgetHardStop: settings.budgetHardStop,
    ticketCost: sumTicketCostUsd(ticketId),
    dayCost: sumDayCostUsd(),
    ticketLimit: Number(settings.budgetPerTicketUsd) || 0,
    dayLimit: Number(settings.budgetPerDayUsd) || 0,
  });
}

export function budgetSnapshot(ticketId?: string) {
  const settings = getSettings();
  return {
    dayCostUsd: sumDayCostUsd(),
    ticketCostUsd: ticketId ? sumTicketCostUsd(ticketId) : null,
    budgetPerTicketUsd: settings.budgetPerTicketUsd,
    budgetPerDayUsd: settings.budgetPerDayUsd,
    budgetHardStop: settings.budgetHardStop,
  };
}
