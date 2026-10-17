import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Changing a bottle's label (relabel.ts, used by updateBottle and the bulk and form saves) has to move every row
 * that points at the bottle AND its label through a composite foreign key onto bottles(id, expression_id), in the same
 * statement. A table added later with such a key would make relabeling fail, so this makes adding one a decision:
 * move it in relabel.ts and list it here.
 */
const MOVED = ["tasting_notes", "tournament_entries"];

function tablesWithBottleLabelKey(): string[] {
  const dir = join(process.cwd(), "drizzle");
  const found = new Set<string>();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql"))) {
    for (const statement of readFileSync(join(dir, file), "utf8").split("--> statement-breakpoint")) {
      if (!/REFERENCES\s+(?:"public"\.)?"?bottles"?\s*\(\s*"?id"?\s*,\s*"?expression_id"?\s*\)/i.test(statement)) continue;
      const table = statement.match(/(?:CREATE|ALTER)\s+TABLE\s+(?:IF NOT EXISTS\s+)?"?([a-z_]+)"?/i)?.[1];
      if (table) found.add(table);
    }
  }
  return [...found].sort();
}

describe("tables that point at a bottle and its label together", () => {
  it("are all moved by a relabel", () => {
    expect(tablesWithBottleLabelKey()).toEqual([...MOVED].sort());
  });
});
