import { formatMoney } from "@/lib/utils";

/**
 * What a bottle cost against its label's MSRP — the same arithmetic as the
 * Numbers "over list price" finding, one bottle at a time. Pure, and fed the
 * numeric strings Postgres returns.
 */
export type Markup = { amount: number; pct: number };

/** Null unless both prices are known and the MSRP is above zero. */
export function markup(paid: string | number | null | undefined, msrp: string | number | null | undefined): Markup | null {
  if (paid === null || paid === undefined || paid === "" || msrp === null || msrp === undefined || msrp === "") return null;
  const p = Number(paid);
  const m = Number(msrp);
  if (!Number.isFinite(p) || !Number.isFinite(m) || m <= 0) return null;
  const amount = Math.round((p - m) * 100) / 100;
  return { amount, pct: Math.round((amount / m) * 100) };
}

/** "+8%" / "−12%" / "MSRP", for a narrow grid cell. */
export function shortMarkup(m: Markup): string {
  if (m.amount === 0) return "MSRP";
  // A sub-1% difference still says which way it went rather than "+0%".
  const pct = m.pct === 0 ? "<1" : String(Math.abs(m.pct));
  return `${m.amount > 0 ? "+" : "−"}${pct}%`;
}

/** "$5.00 (8%) over MSRP" / "$10.00 (12%) under MSRP" / "At MSRP". */
export function describeMarkup(m: Markup): string {
  if (m.amount === 0) return "At MSRP";
  const pct = m.pct === 0 ? "<1" : String(Math.abs(m.pct));
  return `${formatMoney(Math.abs(m.amount).toFixed(2))} (${pct}%) ${m.amount > 0 ? "over" : "under"} MSRP`;
}
