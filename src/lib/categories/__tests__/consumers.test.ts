import { describe, expect, it } from "vitest";
import { categoryKinds, type CategoryKind } from "@/lib/expressions/rules";
import { categoryWheelMap, wheelForCategory } from "@/lib/tasting-wheels";
import { CATEGORY_TREE } from "../tree";
import { OLD_TREE } from "./old-tree";

/**
 * What reads the category parent chain, checked against the old tree and the new one. The migration keeps every old
 * row's id and slug, so anything that goes by slug and parent must give an old category the same answer in both.
 */
type Row = { id: number; slug: string; parentId: number | null; fieldGroup: string };

function rowsOf(nodes: ReadonlyArray<{ slug: string; parent: string | null; group: string }>): Row[] {
  const idOf = new Map(nodes.map((node, index) => [node.slug, index + 1]));
  return nodes.map((node) => ({ id: idOf.get(node.slug)!, slug: node.slug, parentId: node.parent === null ? null : (idOf.get(node.parent) ?? null), fieldGroup: node.group }));
}

const oldRows = rowsOf(OLD_TREE.map(([, slug, parent, group]) => ({ slug, parent, group })));
const newRows = rowsOf(CATEGORY_TREE.map(({ slug, parent, fieldGroup }) => ({ slug, parent, group: fieldGroup })));
const bySlug = (rows: Row[]) => new Map(rows.map((row) => [row.slug, row]));

describe("the kind of every old category", () => {
  it("is the same after the migration", () => {
    const before = categoryKinds(oldRows);
    const after = categoryKinds(newRows);
    const [oldBy, newBy] = [bySlug(oldRows), bySlug(newRows)];
    for (const [, slug] of OLD_TREE) expect(after[newBy.get(slug)!.id], slug).toBe(before[oldBy.get(slug)!.id]);
  });
});

describe("the tasting wheel of every category", () => {
  it("is the same for an old category after the migration", () => {
    const before = categoryWheelMap(oldRows);
    const after = categoryWheelMap(newRows);
    const [oldBy, newBy] = [bySlug(oldRows), bySlug(newRows)];
    for (const [, slug] of OLD_TREE) expect(after.get(newBy.get(slug)!.id), slug).toBe(before.get(oldBy.get(slug)!.id));
  });

  it("is chosen for the new categories by their family", () => {
    const wheels = categoryWheelMap(newRows);
    const of = (slug: string) => wheels.get(bySlug(newRows).get(slug)!.id);
    expect(of("tennessee")).toBe("bourbon");
    for (const slug of ["japanese", "international", "flavored-whisky", "canadian-whisky"]) expect(of(slug), slug).toBe("whisky");
    for (const slug of ["cachaca", "agricole", "spiced-rum"]) expect(of(slug), slug).toBe("rum");
    for (const slug of ["apple", "eau-de-vie"]) expect(of(slug), slug).toBe("brandy");
    for (const slug of ["absinthe", "akvavit", "shochu", "other"]) expect(of(slug), slug).toBeNull();
  });

  it("does not depend on a Whiskey umbrella for the American whiskeys", () => {
    expect(wheelForCategory({ fieldGroup: "whiskey", slugs: ["tennessee", "american-whiskey"] })).toBe("bourbon");
  });
});

/** The recursive walk the grid and the roulette use for a category filter (src/lib/bottles/grid.ts categorySubtree). */
function subtree(rows: Row[], slugs: string[]): Set<string> {
  const ids = new Set(rows.filter((row) => slugs.includes(row.slug)).map((row) => row.id));
  for (let grew = true; grew; ) {
    grew = false;
    for (const row of rows) {
      if (row.parentId !== null && ids.has(row.parentId) && !ids.has(row.id)) {
        ids.add(row.id);
        grew = true;
      }
    }
  }
  return new Set(rows.filter((row) => ids.has(row.id)).map((row) => row.slug));
}

describe("a category filter", () => {
  it("on the old Whiskey row, once the migration has added the three rows that moved out, matches every old whiskey category", () => {
    const before = subtree(oldRows, ["whiskey"]);
    const after = subtree(newRows, ["whiskey", "american-whiskey", "scotch", "irish-whiskey"]);
    for (const slug of before) expect(after.has(slug), slug).toBe(true);
    // The extras are the rows that did not exist before.
    expect([...after].filter((slug) => !before.has(slug)).sort()).toEqual(["flavored-whisky", "international", "japanese", "tennessee"]);
  });

  it("on American Whiskey, Scotch or Irish alone is unchanged", () => {
    for (const slug of ["american-whiskey", "scotch", "irish-whiskey", "rum", "brandy"]) {
      const before = subtree(oldRows, [slug]);
      const after = subtree(newRows, [slug]);
      for (const child of before) expect(after.has(child), `${slug} > ${child}`).toBe(true);
    }
  });
});

/** The CASE in src/lib/bottles/grid.ts (whiskeyKind) and the one in src/lib/expressions/queries.ts, by slug and parent. */
function whiskeyKindSql(rows: Row[], slug: string): CategoryKind | null {
  const self = bySlug(rows).get(slug)!;
  const parent = rows.find((row) => row.id === self.parentId)?.slug;
  if (slug === "american-whiskey" || parent === "american-whiskey") return "american";
  if (slug === "canadian-whisky") return "canadian";
  if (slug === "irish-whiskey" || parent === "irish-whiskey") return "irish";
  if (slug === "scotch" || parent === "scotch") return "scotch";
  return null;
}

describe("the whiskey kind the grid works out in SQL", () => {
  it("agrees with categoryKinds for the four whiskey families, in the new tree", () => {
    const kinds = categoryKinds(newRows);
    for (const row of newRows) {
      const sqlKind = whiskeyKindSql(newRows, row.slug);
      if (sqlKind !== null) expect(kinds[row.id], row.slug).toBe(sqlKind);
    }
    // Tennessee is American; the new international rows have no family kind in the grid.
    expect(whiskeyKindSql(newRows, "tennessee")).toBe("american");
    expect(whiskeyKindSql(newRows, "japanese")).toBeNull();
  });
});
