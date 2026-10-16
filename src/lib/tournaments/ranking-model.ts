import { FIRM_HEATS } from "./ranking";
import type { RankedCompetitor, RankingResult } from "./ranking-query";

export type RankingView = "ranking" | "audit";

const first = (raw: string | string[] | undefined): string | undefined => (Array.isArray(raw) ? raw[0] : raw);

/** The page's query string: a positive whole-number category, or none; "audit", or the ranking. Junk falls back to the defaults. */
export function parseRankingParams(sp: Record<string, string | string[] | undefined>): { categoryId: number | null; view: RankingView } {
  const raw = first(sp.categoryId);
  const n = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return { categoryId: Number.isSafeInteger(n) && n > 0 ? n : null, view: first(sp.view) === "audit" ? "audit" : "ranking" };
}

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

const rating = (n: number): string => n.toFixed(1);

export type RankingRow = {
  id: string;
  rankText: string;
  name: string;
  heats: number;
  tags: string[];
  /** The average 0 to 10 tasting rating, one decimal, or null. */
  rating: string | null;
  /** The competitor's label page, or null. */
  href: string | null;
};

export type RankingSection = {
  /** null when everyone is comparable (the usual case); otherwise "Group 1 of 2". */
  title: string | null;
  size: number;
  note: string | null;
  rows: RankingRow[];
};

/**
 * Display sections of the ranking. Strengths are comparable only inside a group of competitors linked by shared
 * flights, so each group is its own section and ranks never run across them. The strength itself is not shown: it is
 * a log value that means something only next to its group's others, and the rank already carries the order.
 */
export function rankingSections(result: RankingResult): RankingSection[] {
  const groups = [...new Set(result.competitors.map((c) => c.group))].sort((a, b) => a - b);
  return groups.map((group, i) => {
    const members = result.competitors.filter((c) => c.group === group);
    const shared = new Map<number, number>();
    for (const m of members) shared.set(m.rank, (shared.get(m.rank) ?? 0) + 1);
    return {
      title: groups.length > 1 ? `Group ${i + 1} of ${groups.length}` : null,
      size: members.length,
      note: groups.length > 1 ? "Not comparable with the other groups: these bottles never shared a flight with them." : null,
      rows: members.map((m) => ({
        id: m.id,
        rankText: ordinal(m.rank) + ((shared.get(m.rank) ?? 1) > 1 ? "=" : ""),
        name: m.name,
        heats: m.heats,
        tags: [...(m.provisional ? ["Provisional"] : []), ...(m.singleBand ? ["Single band"] : [])],
        rating: m.rating === null ? null : rating(m.rating),
        href: m.expressionId !== null ? `/expressions/${m.expressionId}` : null,
      })),
    };
  });
}

export type AuditLine = {
  id: string;
  name: string;
  /** "Rated 9.0, ranks 14th of 40". */
  text: string;
  direction: "higher" | "lower";
  verdict: string;
  /** How many places the ranking and the rating disagree by. */
  gap: number;
};

/** One line per disagreement, biggest first (the engine's order). A rank that matches its rating is not a disagreement. */
export function auditLines(result: RankingResult): AuditLine[] {
  return result.audit
    .filter((row) => row.gap !== 0)
    .map((row) => {
      // Positive gap: the ranking puts it lower than its rating alone would.
      const direction = row.gap > 0 ? "lower" : "higher";
      return {
        id: row.id,
        name: row.name,
        text: `Rated ${rating(row.rating)}, ranks ${ordinal(row.rank)} of ${row.groupSize}`,
        direction,
        verdict: `Ranks ${direction} than your rating suggests`,
        gap: Math.abs(row.gap),
      };
    });
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** What the audit leaves out and why, or null when nothing is left out. */
export function auditNote(result: RankingResult): string | null {
  const provisional = result.competitors.filter((c) => c.provisional && c.rating !== null).length;
  const single = result.competitors.filter((c) => !c.provisional && c.singleBand && c.rating !== null).length;
  const unrated = result.competitors.filter((c) => c.rating === null).length;
  const parts = [
    provisional > 0 ? `${provisional} ${plural(provisional, "is", "are")} provisional (fewer than ${FIRM_HEATS} flights)` : null,
    single > 0 ? `${single} only met one proof band` : null,
    unrated > 0 ? `${unrated} ${plural(unrated, "has", "have")} no rating` : null,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return null;
  const last = parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}` : parts[0]!;
  return `${last}, so ${parts.length === 1 && provisional + single + unrated === 1 ? "it is" : "they are"} not audited.`;
}

/** Why a view has nothing to show, or null when it has something. Ranking only needs `no-flights`. */
export function rankingEmpty(result: RankingResult): "no-flights" | "no-ratings" | "no-gaps" | null {
  if (result.competitors.length === 0) return "no-flights";
  if (result.competitors.every((c: RankedCompetitor) => c.rating === null)) return "no-ratings";
  if (auditLines(result).length === 0) return "no-gaps";
  return null;
}
