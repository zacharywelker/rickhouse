import { describe, expect, it } from "vitest";
import { defaultHighlight, distance, moveHighlight, normalise, resolveKey, suggest, type Candidate } from "../suggest";

const labels: Candidate[] = [
  { id: 1, name: "Single Barrel" },
  { id: 2, name: "Small Batch" },
  { id: 3, name: "Yellow Label" },
  { id: 4, name: "Private Selection OESV" },
];
const names = (s: ReturnType<typeof suggest>) => s.items.map((i) => i.name);

describe("normalise and distance", () => {
  it("ignores case, accents, punctuation and spacing", () => {
    expect(normalise("  Elijah-Craig  ")).toBe("elijah craig");
    expect(normalise("Café & Cream")).toBe("cafe and cream");
    expect(normalise("")).toBe("");
  });
  it("counts a swapped pair as one slip", () => {
    expect(distance("singel", "single")).toBe(1);
    expect(distance("single", "single")).toBe(0);
    expect(distance("kitten", "sitting")).toBe(3);
  });
});

describe("suggest", () => {
  it("offers everything, in order, when nothing is typed, and nothing to create", () => {
    const s = suggest("", labels, { allowCreate: true });
    expect(names(s)).toEqual(["Private Selection OESV", "Single Barrel", "Small Batch", "Yellow Label"]);
    expect(s.create).toBeNull();
  });
  it("matches the start of the name, then the start of any word, then anywhere", () => {
    expect(names(suggest("sm", labels, { allowCreate: true }))[0]).toBe("Small Batch");
    expect(names(suggest("bar", labels, { allowCreate: true }))).toEqual(["Single Barrel"]);
    expect(names(suggest("label", labels, { allowCreate: true }))).toEqual(["Yellow Label"]);
    expect(names(suggest("ngle", labels, { allowCreate: true }))).toEqual(["Single Barrel"]);
  });
  it("puts an exact match first, in any case, and does not offer to create what already exists", () => {
    const s = suggest("single barrel", labels, { allowCreate: true });
    expect(s.exact?.id).toBe(1);
    expect(s.items[0]?.id).toBe(1);
    expect(s.create).toBeNull();
  });
  it("offers Create for text that matches nothing, with the text tidied", () => {
    expect(suggest("  Private   Pick ", labels, { allowCreate: true }).create).toEqual({ name: "Private Pick" });
  });
  it("does not offer Create where creating is not allowed", () => {
    expect(suggest("Brand New", labels, { allowCreate: false }).create).toBeNull();
  });

  describe("near matches", () => {
    it("finds a slip while typing, and says so", () => {
      const s = suggest("Singel Bar", labels, { allowCreate: true });
      expect(s.items[0]).toMatchObject({ id: 1, near: true });
      expect(s.hint).toBe("Did you mean Single Barrel?");
      // The slip is still its own name: Create is there, and is never the default.
      expect(s.create).toEqual({ name: "Singel Bar" });
    });
    it("takes the same name in different spacing or punctuation as a match for it, with the existing one first", () => {
      const brands: Candidate[] = [{ id: 1, name: "Elijah Craig" }];
      for (const typed of ["Elijah-Craig", "ElijahCraig", "elijah  craig."]) {
        const s = suggest(typed, brands, { allowCreate: true });
        expect(s.items[0]).toMatchObject({ id: 1, near: false });
        // Not the exact name, so Create is still there, but it is never what is highlighted.
        expect(s.create).not.toBeNull();
        expect(defaultHighlight(s)).toEqual({ kind: "item", index: 0 });
      }
    });
    it("finds a slip in the middle of a longer name", () => {
      expect(suggest("Elijha Craig", [{ id: 1, name: "Elijah Craig" }], { allowCreate: true }).items[0]).toMatchObject({ id: 1, near: true });
    });
    it("puts the closest near match first, because that is what Tab and Enter take", () => {
      const brands: Candidate[] = [
        { id: 1, name: "Brand 0" },
        { id: 2, name: "Brand 1" },
        { id: 3, name: "Brand 3" },
      ];
      expect(suggest("Brand 33", brands, { allowCreate: true }).items[0]).toMatchObject({ id: 3, near: true });
      expect(suggest("Brand 33", brands, { allowCreate: true }).hint).toBe("Did you mean Brand 3?");
    });
    it("is not near for very short text, where nearly everything would be", () => {
      expect(suggest("Zzz", [{ id: 1, name: "Zzy" }], { allowCreate: true }).items).toEqual([]);
    });
    it("is not near for something that is simply different", () => {
      expect(suggest("Hendricks", labels, { allowCreate: true }).items).toEqual([]);
    });
    it("gives no hint when something already matches", () => {
      expect(suggest("Sing", labels, { allowCreate: true }).hint).toBeNull();
    });
  });

  it("shows matches that exist only in this sheet like any other", () => {
    const withDraft: Candidate[] = [...labels, { id: null, name: "Four Roses OESV" }];
    expect(suggest("four", withDraft, { allowCreate: true }).items[0]).toMatchObject({ id: null, name: "Four Roses OESV" });
  });

  it("limits how many matches it lists", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: i, name: `Label ${i}` }));
    expect(suggest("label", many, { allowCreate: true }).items).toHaveLength(8);
    expect(suggest("", many, { allowCreate: true }).items).toHaveLength(30);
  });
});

describe("highlight", () => {
  it("starts on the first match, or on Create when there are none, or nowhere", () => {
    expect(defaultHighlight(suggest("sm", labels, { allowCreate: true }))).toEqual({ kind: "item", index: 0 });
    expect(defaultHighlight(suggest("Nothing", labels, { allowCreate: true }))).toEqual({ kind: "create" });
    expect(defaultHighlight(suggest("Nothing", labels, { allowCreate: false }))).toBeNull();
  });
  it("moves down through the matches and then Create, and stops at the ends", () => {
    const s = suggest("Singel Bar", labels, { allowCreate: true });
    expect(s.items).toHaveLength(1);
    const first = defaultHighlight(s);
    const second = moveHighlight(s, first, 1);
    expect(second).toEqual({ kind: "create" });
    expect(moveHighlight(s, second, 1)).toEqual({ kind: "create" });
    expect(moveHighlight(s, second, -1)).toEqual({ kind: "item", index: 0 });
    expect(moveHighlight(s, first, -1)).toEqual({ kind: "item", index: 0 });
  });
});

describe("resolveKey: a typo never silently creates", () => {
  const slip = suggest("Singel Bar", labels, { allowCreate: true });
  const none = suggest("Brand New Label", labels, { allowCreate: true });

  it("Tab and Enter both take the highlighted existing match, even a near one", () => {
    const highlight = defaultHighlight(slip);
    expect(resolveKey("Tab", slip, highlight, "label")).toMatchObject({ accept: { id: 1 } });
    expect(resolveKey("Enter", slip, highlight, "label")).toMatchObject({ accept: { id: 1 } });
  });
  it("Enter on the Create option creates", () => {
    expect(resolveKey("Enter", slip, { kind: "create" }, "label")).toEqual({ create: "Singel Bar" });
    expect(resolveKey("Enter", none, defaultHighlight(none), "label")).toEqual({ create: "Brand New Label" });
  });
  it("Tab with Create highlighted creates nothing and says how to", () => {
    const outcome = resolveKey("Tab", none, defaultHighlight(none), "label");
    expect(outcome).toMatchObject({ block: expect.stringContaining('Press Enter to create "Brand New Label"') });
    expect("create" in outcome).toBe(false);
  });
  it("blocks, and keeps what was typed, when nothing can be chosen", () => {
    const closed = suggest("zzz", labels, { allowCreate: false });
    expect(resolveKey("Enter", closed, defaultHighlight(closed), "category")).toEqual({ block: "Choose a category from the list." });
    expect(resolveKey("Tab", closed, null, "category")).toEqual({ block: "Choose a category from the list." });
  });
  it("never creates from a key other than Enter on the Create option, however it is reached", () => {
    for (const text of ["Singel Bar", "Brand New", "x", "Four Rose", "single  barel"]) {
      const s = suggest(text, labels, { allowCreate: true });
      for (const highlight of [defaultHighlight(s), moveHighlight(s, defaultHighlight(s), 1), null]) {
        expect("create" in resolveKey("Tab", s, highlight, "label")).toBe(false);
      }
    }
  });
});
