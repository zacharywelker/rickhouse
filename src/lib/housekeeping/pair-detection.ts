import { distance, normalise, slipsAllowed } from "../bulk-editor/suggest";
import type { DuplicateKind } from "./duplicate-kinds";

export type NameRow = { id: number; name: string; group?: string | null; place?: string | null };
export type Pair = { aId: number; bId: number; score: 0 | 1 | 2; reason: string };

const companyWords = ["the", "co", "company", "inc", "llc", "ltd", "corp"] as const;
export const FILLER_WORDS: Record<DuplicateKind, readonly string[]> = {
  brands: companyWords,
  distilleries: ["distillery", "distilling", "distillers", "co", "company", "inc", "llc", "ltd", "the"],
  companies: companyWords,
  finishes: ["finish", "finished"],
  ingredients: [],
  mashbills: [],
  cooperages: companyWords,
  stores: companyWords,
  tags: [],
};

const byName = new Intl.Collator("en", { sensitivity: "base" });
const byIds = (a: Pair, b: Pair) => a.aId - b.aId || a.bId - b.bId;

export function findNamePairs(kind: Exclude<DuplicateKind, "mashbills">, rows: NameRow[]): Pair[] {
  const fillers = new Set(FILLER_WORDS[kind]);
  const prepared = rows.map((row) => {
    const words = normalise(row.name).split(" ").filter(Boolean);
    const squished = words.join("");
    // A character-count lower bound avoids expensive distance matrices for unrelated names.
    // Transpositions preserve counts; each other edit changes the total difference by at most two.
    const counts = new Uint16Array(36);
    for (const char of squished) counts[parseInt(char, 36)]! += 1;
    return {
      row, squished, counts,
      // A number is part of a name (a proof, a batch, a year), so a typo match must agree on every digit.
      digits: squished.replace(/\D/g, ""),
      stripped: words.filter((word) => !fillers.has(word)).join(""),
      dropped: words.filter((word) => fillers.has(word)),
    };
  }).sort((a, b) => byName.compare(a.row.name, b.row.name) || a.row.id - b.row.id);
  const matches: { pair: Pair; first: number; second: number }[] = [];

  for (let i = 0; i < prepared.length; i += 1) {
    const a = prepared[i]!;
    for (let j = i + 1; j < prepared.length; j += 1) {
      const b = prepared[j]!;
      if (a.row.id === b.row.id || !a.squished || !b.squished) continue;
      if (kind === "ingredients" && (a.row.group ?? null) !== (b.row.group ?? null)) continue;
      if (kind === "stores" && a.row.place && b.row.place && a.row.place !== b.row.place) continue;
      let score: Pair["score"];
      let reason: string;
      if (a.squished === b.squished) {
        score = 0;
        reason = "Same name apart from spacing and punctuation";
      } else {
        const allowed = slipsAllowed(Math.min(a.squished.length, b.squished.length));
        if (allowed === 0) continue;
        if (a.stripped && a.stripped === b.stripped) {
          score = 1;
          const dropped = [...new Set([...a.dropped, ...b.dropped])].sort();
          const words = dropped.map((word) => `“${word[0]!.toUpperCase()}${word.slice(1)}”`).join(", ");
          reason = `Same name once ${words} ${dropped.length === 1 ? "is" : "are"} dropped`;
        } else {
          // Whole names only: the autocomplete's prefix matching does not apply here.
          if (Math.abs(a.squished.length - b.squished.length) > allowed) continue;
          let difference = 0;
          for (let k = 0; k < a.counts.length && difference <= allowed * 2; k += 1) {
            difference += Math.abs(a.counts[k]! - b.counts[k]!);
          }
          if (difference > allowed * 2) continue;
          if (a.digits !== b.digits) continue;
          const slips = distance(a.squished, b.squished);
          if (slips > allowed) continue;
          score = 2;
          reason = a.squished + "s" === b.squished || b.squished + "s" === a.squished
            ? "Same name apart from the plural"
            : slips === 1 ? "One letter apart" : `${slips} letters apart`;
        }
      }
      matches.push({
        pair: { aId: Math.min(a.row.id, b.row.id), bId: Math.max(a.row.id, b.row.id), score, reason },
        first: i, second: j,
      });
    }
  }
  return matches.sort((a, b) => a.pair.score - b.pair.score
    || byName.compare(prepared[a.first]!.row.name, prepared[b.first]!.row.name)
    || byName.compare(prepared[a.second]!.row.name, prepared[b.second]!.row.name)
    || byIds(a.pair, b.pair)).map(({ pair }) => pair);
}

export function findMashbillPairs(rows: { id: number; key: string }[]): Pair[] {
  const groups = new Map<string, number[]>();
  for (const { id, key } of rows) {
    const group = groups.get(key) ?? [];
    group.push(id);
    groups.set(key, group);
  }
  const pairs: Pair[] = [];
  for (const ids of groups.values()) {
    ids.sort((a, b) => a - b);
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        if (ids[i] === ids[j]) continue;
        pairs.push({ aId: ids[i]!, bId: ids[j]!, score: 0, reason: "Same grain recipe" });
      }
    }
  }
  return pairs.sort(byIds);
}
