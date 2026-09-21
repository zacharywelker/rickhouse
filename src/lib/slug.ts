import "server-only";
import { and, eq, ne, type SQL, type Table } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { slugify } from "./utils";

/**
 * Slugs are generated from the name on create and stay editable afterwards
 * (SPEC: Conventions).
 *
 * A slug the user typed is taken literally — a collision is an error they
 * should see, not something to silently rename. A slug we generated gets a
 * numeric suffix until it is free, because auto-generated collisions are
 * routine: two distilleries called "Old Mill" in different states, say.
 */
export async function resolveSlug(options: {
  table: Table;
  column: PgColumn;
  idColumn: PgColumn;
  requested: string | null;
  fallbackFrom: string;
  excludeId?: number;
}): Promise<string> {
  const { table, column, idColumn, requested, fallbackFrom, excludeId } = options;

  if (requested !== null) return requested;

  const base = slugify(fallbackFrom) || "item";

  const taken = async (candidate: string): Promise<boolean> => {
    const filters: SQL[] = [eq(column, candidate)];
    if (excludeId !== undefined) filters.push(ne(idColumn, excludeId));
    const count = await db.$count(table, filters.length === 1 ? filters[0] : and(...filters));
    return count > 0;
  };

  if (!(await taken(base))) return base;

  for (let suffix = 2; suffix < 200; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!(await taken(candidate))) return candidate;
  }

  // Practically unreachable; better than looping forever.
  return `${base}-${Date.now()}`;
}
