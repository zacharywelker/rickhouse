import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Merging two labels (merge.ts) has to deal with every table that points at a label. A table added
 * later that does would be deleted along with the removed label by the cascade, or block the
 * merge, without anyone noticing. This lists the tables from the migrations and makes adding one
 * a decision: handle it in merge.ts and list it under MOVED, or say it may go with the label under CASCADED.
 */
const MOVED = ["bottles", "expression_colas", "expression_names", "expression_releases", "tasting_notes"];
const CASCADED = ["expression_distilleries", "expression_finishes", "expression_mashbills"];

function tablesReferencingExpressions(): string[] {
  const dir = join(process.cwd(), "drizzle");
  const found = new Set<string>();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql"))) {
    for (const statement of readFileSync(join(dir, file), "utf8").split("--> statement-breakpoint")) {
      if (!/REFERENCES\s+(?:"public"\.)?"?expressions"?\s*\(/i.test(statement)) continue;
      const table = statement.match(/(?:CREATE|ALTER)\s+TABLE\s+(?:IF NOT EXISTS\s+)?"?([a-z_]+)"?/i)?.[1];
      if (table && table !== "expressions") found.add(table);
    }
  }
  return [...found].sort();
}

describe("tables that point at a label", () => {
  it("are all accounted for by the label merge", () => {
    expect(tablesReferencingExpressions()).toEqual([...MOVED, ...CASCADED].sort());
  });
});
