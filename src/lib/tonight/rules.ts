/**
 * What to drink tonight (docs/superpowers/specs/2026-10-08-tonight-design.md): the rules, as pure functions so they
 * can be tested without a database. `queries.ts` gathers the rows; nothing here reads or writes anything.
 */

/** Tastings of a spirit needed before its flavors are offered. */
export const MIN_SPIRIT_TASTINGS = 10;
/** Tastings in the whole account needed before any flavors are offered. */
export const MIN_TOTAL_TASTINGS = 25;
/** A label not tasted for this many days counts as neglected. */
export const STALE_DAYS = 60;
/** What each flavor a bottle matches adds to its weight. Gentle on purpose: the draw leans, it does not filter. */
export const FLAVOR_WEIGHT = 1;
/** The proof step is skipped when the bottles in play span less than this many proof, or number fewer than three. */
export const PROOF_SPAN_MIN = 15;
export const PROOF_BOTTLES_MIN = 3;
/** A mute lasts at most this many months, so a muted bottle always comes back. */
export const MUTE_MAX_MONTHS = 3;

export type BandKey = "easy" | "standard" | "barrel";

export const BANDS: { key: BandKey; label: string; range: string; has: (proof: number) => boolean }[] = [
  { key: "easy", label: "Easy-going", range: "Under 90 proof", has: (p) => p < 90 },
  { key: "standard", label: "Standard", range: "90 to 109 proof", has: (p) => p >= 90 && p < 110 },
  { key: "barrel", label: "Barrel-strength", range: "110 proof and up", has: (p) => p >= 110 },
];

export function isBandKey(value: unknown): value is BandKey {
  return BANDS.some((band) => band.key === value);
}

/** One bottle in play, with what the draw needs to know about it. */
export type Candidate = {
  id: number;
  categoryId: number;
  sealed: boolean;
  proof: number | null;
  /** Descriptor keys across every tasting of the bottle's label, each key once. */
  tags: string[];
  /** Days since the label was last tasted; null when it never was. */
  daysSinceTasted: number | null;
  /** The bottle's spirit has a wheel and enough tastings for its notes to be trusted. */
  spiritQualifies: boolean;
};

/** Whether a spirit's flavors can be offered: it has a wheel, enough tastings of its own, and the account has enough overall. */
export function spiritQualifies(stat: { tastings: number; hasWheel: boolean }, totalTastings: number): boolean {
  return stat.hasWheel && stat.tastings >= MIN_SPIRIT_TASTINGS && totalTastings >= MIN_TOTAL_TASTINGS;
}

/** A bottle has notes to match when its spirit qualifies and some tasting of its label chose flavors. */
export function hasNotes(c: Candidate): boolean {
  return c.spiritQualifies && c.tags.length > 0;
}

export function isStale(c: Candidate): boolean {
  return c.daysSinceTasted === null || c.daysSinceTasted >= STALE_DAYS;
}

/** The chosen flavors this bottle's notes hold. Empty for a bottle with no notes. */
export function matchedFlavors(c: Candidate, flavors: string[]): string[] {
  if (!hasNotes(c)) return [];
  const mine = new Set(c.tags);
  return flavors.filter((key) => mine.has(key));
}

/**
 * How likely a bottle is to be drawn, relative to the others: 1, plus one for each chosen flavor it matches (a
 * bottle with no notes counts as matching one, so unknown bottles are not punished), plus one if it was never
 * tasted or not lately. Between 1 and 2 + the number of chosen flavors.
 */
export function weightOf(c: Candidate, flavors: string[]): number {
  let weight = 1;
  if (flavors.length > 0) weight += hasNotes(c) ? matchedFlavors(c, flavors).length * FLAVOR_WEIGHT : FLAVOR_WEIGHT;
  if (isStale(c)) weight += 1;
  return weight;
}

/** One item drawn in proportion to its weight, or null when there are none. `random` returns [0, 1). */
export function drawWeighted<T>(items: T[], weight: (item: T) => number, random: () => number = Math.random): T | null {
  if (items.length === 0) return null;
  const weights = items.map(weight);
  let at = random() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < items.length; i++) {
    at -= weights[i]!;
    if (at < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** One item drawn uniformly, for Roulette. */
export function drawUniform<T>(items: T[], random: () => number = Math.random): T | null {
  return drawWeighted(items, () => 1, random);
}

export function bandOf(proof: number | null): BandKey | null {
  if (proof === null) return null;
  return BANDS.find((band) => band.has(proof))?.key ?? null;
}

/** With no band chosen every bottle is in; with some, a bottle must sit in one of them (and so must have a proof). */
export function inBands(proof: number | null, chosen: BandKey[]): boolean {
  if (chosen.length === 0) return true;
  const band = bandOf(proof);
  return band !== null && chosen.includes(band);
}

/** Whether the proof step is worth asking: three or more bottles with a proof, spanning at least 15. */
export function proofApplies(proofs: (number | null)[]): boolean {
  const known = proofs.filter((p): p is number => p !== null);
  if (known.length < PROOF_BOTTLES_MIN) return false;
  return Math.max(...known) - Math.min(...known) >= PROOF_SPAN_MIN;
}

export function bandCounts(proofs: (number | null)[]): Record<BandKey, number> {
  const counts: Record<BandKey, number> = { easy: 0, standard: 0, barrel: 0 };
  for (const proof of proofs) {
    const band = bandOf(proof);
    if (band !== null) counts[band]++;
  }
  return counts;
}

/** The sentences under a result saying why the bottle came up. */
export function reasonsFor(args: {
  candidate: Candidate;
  flavors: string[];
  flavorLabel: (key: string) => string;
  spiritName: string;
}): string[] {
  const { candidate, flavors, flavorLabel, spiritName } = args;
  const lines: string[] = [];
  if (flavors.length > 0) {
    if (hasNotes(candidate)) {
      const matched = matchedFlavors(candidate, flavors).map((key) => flavorLabel(key).toLowerCase());
      lines.push(matched.length > 0 ? `Matches ${list(matched)} from your notes.` : "Not a flavor match. Flavors only nudge the draw.");
    } else {
      lines.push(
        candidate.daysSinceTasted === null
          ? "A wildcard: never tasted, so no notes to match."
          : `A wildcard: not enough ${spiritName.toLowerCase()} tastings to match on flavor.`,
      );
    }
  }
  if (candidate.daysSinceTasted !== null && candidate.daysSinceTasted >= STALE_DAYS) {
    lines.push(`Last tasted ${candidate.daysSinceTasted} days ago.`);
  }
  return lines;
}

function list(words: string[]): string {
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : (words[0] ?? "");
}

// ---- Mutes ----

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const real = new Date(Date.UTC(y, m - 1, d));
  return real.getUTCFullYear() === y && real.getUTCMonth() === m - 1 && real.getUTCDate() === d ? { y, m, d } : null;
}

function iso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** `date` plus whole months, the day clamped to the target month's length (Nov 30 plus 3 is Feb 28). */
export function addMonths(date: string, months: number): string {
  const p = parseIso(date);
  if (!p) throw new Error(`Not a date: ${date}`);
  const index = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return iso(y, m, Math.min(p.d, last));
}

/** The day after `date`. */
export function nextDay(date: string): string {
  const p = parseIso(date);
  if (!p) throw new Error(`Not a date: ${date}`);
  const next = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
  return iso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export type MuteCheck = { ok: true } | { ok: false; message: string };

/** The dates a mute may end on: from tomorrow to three months from today, in the server's calendar. */
export function muteWindow(today: string): { min: string; max: string } {
  return { min: nextDay(today), max: addMonths(today, MUTE_MAX_MONTHS) };
}

/**
 * The lengths the phone offers, as end dates in the server's calendar so the phone does no date arithmetic of its own
 * (a phone in another time zone would otherwise be a day off the window above).
 */
export function mutePresets(today: string): { key: "week" | "month" | "quarter"; label: string; until: string }[] {
  const week = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000);
  return [
    { key: "week", label: "1 week", until: week.toISOString().slice(0, 10) },
    { key: "month", label: "1 month", until: addMonths(today, 1) },
    { key: "quarter", label: "3 months", until: addMonths(today, MUTE_MAX_MONTHS) },
  ];
}

/** A mute's end date must be a real date inside the window. */
export function checkMuteUntil(until: unknown, today: string): MuteCheck {
  if (typeof until !== "string" || parseIso(until) === null) return { ok: false, message: "Send the end date as YYYY-MM-DD." };
  const { min, max } = muteWindow(today);
  if (until < min) return { ok: false, message: "Pick a date after today." };
  if (until > max) return { ok: false, message: `A mute lasts at most ${MUTE_MAX_MONTHS} months. Pick a date on or before ${max}.` };
  return { ok: true };
}
