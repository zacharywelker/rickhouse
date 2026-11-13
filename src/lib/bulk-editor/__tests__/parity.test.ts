import { describe, expect, it } from "vitest";
import { BOTTLE_SECTIONS, BOTTLE_STATE_SECTION } from "@/lib/expressions/bottle-fields";
import { EXPRESSION_SECTIONS } from "@/lib/expressions/fields";
import { EDITORS } from "../editors";
import { NOT_HERE } from "../fields";

/**
 * The gate that let the old inline Edit and Bulk add be retired (#319): every field on the bottle form and the label form either
 * has a cell in the sheet, or is in `NOT_HERE` with the step that will give it one (or the reason it never will).
 *
 * Fields are told apart by side: a label's proof and a bottle's own proof are two fields of one name, and each needs its
 * own cell. And the list may not go stale: a field marked for a later step that the sheet already edits fails here, so it
 * is taken off the list.
 */

const names = (sections: ReadonlyArray<{ fields: ReadonlyArray<{ name: string }> }>) => [...new Set(sections.flatMap((s) => s.fields.map((f) => f.name)))];
const LABEL_FIELDS = names(EXPRESSION_SECTIONS);
const BOTTLE_FIELDS = names([...BOTTLE_SECTIONS, BOTTLE_STATE_SECTION]);

/** The form fields a side's cells set. The three pickers made by hand stand for the fields behind them. */
function covered(scope: "label" | "bottle"): Set<string> {
  const set = new Set<string>();
  for (const editor of Object.values(EDITORS)) {
    if (editor.scope !== scope) continue;
    if (editor.fieldsOf) for (const name of Object.keys(editor.fieldsOf(""))) set.add(name);
    else set.add(editor.field);
  }
  if (scope === "label") {
    // The Brand cell sets the brand, the Label cell the name, the Category cell the category.
    set.add("brandId").add("name").add("categoryId");
  } else {
    // Moving a bottle (Brand or Label) sets the label it is on.
    set.add("expressionId");
  }
  return set;
}

describe("the sheet has a cell for every field on the label form", () => {
  const have = covered("label");
  it("has a cell, or a reviewed reason, for each", () => {
    const missing = LABEL_FIELDS.filter((name) => !have.has(name) && !(name in NOT_HERE));
    expect(missing).toEqual([]);
  });
});

describe("the sheet has a cell for every field on the bottle form", () => {
  const have = covered("bottle");
  it("has a cell, or a reviewed reason, for each", () => {
    const missing = BOTTLE_FIELDS.filter((name) => !have.has(name) && !(name in NOT_HERE));
    expect(missing).toEqual([]);
  });
});

describe("the list of what is not here yet", () => {
  const all = new Set([...LABEL_FIELDS, ...BOTTLE_FIELDS]);
  it("names only fields the forms have", () => {
    expect(Object.keys(NOT_HERE).filter((name) => !all.has(name))).toEqual([]);
  });
  it("is honest: a field marked for a later step is not yet edited, on the side it is marked for", () => {
    const later = Object.entries(NOT_HERE).filter(([, why]) => why.startsWith("#"));
    const label = covered("label");
    const bottle = covered("bottle");
    // A field of both forms (age) is missing on each side until its step is done.
    const editedBoth = later.filter(([name]) => (LABEL_FIELDS.includes(name) ? label.has(name) : true) && (BOTTLE_FIELDS.includes(name) ? bottle.has(name) : true));
    expect(editedBoth.map(([name]) => name)).toEqual([]);
  });
  it("has nothing left for a later step: what is not a cell of its own is a reviewed reason", () => {
    expect(Object.entries(NOT_HERE).filter(([, why]) => why.startsWith("#"))).toEqual([]);
  });
});
