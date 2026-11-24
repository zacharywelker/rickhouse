import { searchLabels, words, type LabelDoc } from "@/lib/expressions/label-search";
import { groupHref, type RailGroup } from "@/lib/groups/rail";

export const PER_GROUP = 3;
export type OwnedBottle = { id: number; expressionId: number; brand: string; name: string; category: string; proof: string | null; isOpen: boolean; fillPct: number };
export type BrandRef = { id: number; name: string; labels: number; bottles: number };
export type DistilleryRef = BrandRef & { place: string | null };
export type NavSearchData = { labels: LabelDoc[]; ownedBottles: OwnedBottle[]; brands: BrandRef[]; distilleries: DistilleryRef[]; groups: RailGroup[] };
export type NavRow = { key: string; title: string; detail: string; href: string };
export type NavSearchResult = { bottles: NavRow[]; labels: NavRow[]; brands: NavRow[]; distilleries: NavRow[]; groups: NavRow[]; newLabelHref: string | null };

export function newLabelHref(query: string): string {
  return "/expressions/new?name=" + encodeURIComponent(query.trim());
}

function counts(ref: BrandRef): string {
  return `${ref.labels} ${ref.labels === 1 ? "label" : "labels"} · ${ref.bottles} ${ref.bottles === 1 ? "bottle" : "bottles"}`;
}

/** The database holds proof as "125.60"; people read "125.6". */
function proofText(proof: string | null): string | null {
  const value = proof === null ? NaN : Number(proof);
  return Number.isFinite(value) ? String(value) : null;
}

function categoryDetail(item: { category: string; proof: string | null }): string {
  const proof = proofText(item.proof);
  return item.category + (proof ? ` · ${proof} proof` : "");
}

function matching<T extends { name: string }>(refs: T[], terms: string[]): T[] {
  return refs
    .map((ref) => ({ ref, text: words(ref.name).join(" ") }))
    .filter(({ text }) => terms.every((term) => text.includes(term)))
    .sort((a, b) => Number(b.text.startsWith(terms[0]!)) - Number(a.text.startsWith(terms[0]!)) || a.ref.name.localeCompare(b.ref.name))
    .slice(0, PER_GROUP)
    .map(({ ref }) => ref);
}

export function navSearch(data: NavSearchData, query: string): NavSearchResult {
  const result: NavSearchResult = { bottles: [], labels: [], brands: [], distilleries: [], groups: [], newLabelHref: null };
  const terms = [...new Set(words(query))];
  if (terms.length === 0) return result;
  result.newLabelHref = newLabelHref(query);

  const ownedByLabel = new Map<number, OwnedBottle[]>();
  for (const bottle of data.ownedBottles) ownedByLabel.set(bottle.expressionId, [...(ownedByLabel.get(bottle.expressionId) ?? []), bottle]);

  const hits = searchLabels(data.labels, query, { limit: Number.POSITIVE_INFINITY }).hits;
  for (const { doc, group } of hits) {
    if (group !== "label") continue;
    const owned = ownedByLabel.get(doc.id) ?? [];
    if (owned.length > 0) {
      for (const bottle of owned) {
        result.bottles.push({
          key: `bottle-${bottle.id}`,
          title: `${bottle.brand} ${bottle.name}`,
          detail: categoryDetail(bottle) + " · " + (bottle.isOpen ? `open, ${bottle.fillPct}%` : "sealed"),
          href: `/bottles/${bottle.id}`,
        });
      }
    } else {
      result.labels.push({
        key: `label-${doc.id}`, title: `${doc.brand} ${doc.name}`,
        detail: categoryDetail(doc) + " · no bottle", href: `/expressions/${doc.id}`,
      });
    }
  }
  result.bottles = result.bottles.slice(0, PER_GROUP);
  result.labels = result.labels.slice(0, PER_GROUP);
  result.brands = matching(data.brands, terms).map((brand) => ({
    key: `brand-${brand.id}`, title: brand.name, detail: counts(brand), href: `/bottles?brand=${brand.id}`,
  }));
  result.distilleries = matching(data.distilleries, terms).map((distillery) => ({
    key: `distillery-${distillery.id}`, title: distillery.name,
    detail: (distillery.place ? `${distillery.place} · ` : "") + counts(distillery), href: `/bottles?distillery=${distillery.id}`,
  }));
  result.groups = matching(data.groups, terms).map((group) => ({
    key: `group-${group.id}`, title: group.name, detail: "Group", href: groupHref(group),
  }));
  return result;
}
