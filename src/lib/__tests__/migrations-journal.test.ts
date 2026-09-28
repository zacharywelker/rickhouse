import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Drizzle migrates only from the journal, so a .sql file a merge dropped from
// _journal.json is silently never applied (see 1dd23b4).
const dir = join(process.cwd(), "drizzle");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, "")).sort();
const entries: { idx: number; tag: string }[] = JSON.parse(readFileSync(join(dir, "meta/_journal.json"), "utf8")).entries;

describe("drizzle migrations journal", () => {
  it("lists every migration file exactly once, and nothing else", () => {
    expect(entries.map((e) => e.tag).sort()).toEqual(files);
  });

  it("numbers entries in order with no gaps or duplicate prefixes", () => {
    entries.forEach((e, i) => {
      expect(e.idx).toBe(i);
      expect(e.tag.slice(0, 4)).toBe(String(i).padStart(4, "0"));
    });
  });
});
