import "server-only";
import { and, eq } from "drizzle-orm";
import { brands } from "@/db/schema";
import { resolveSlug } from "@/lib/slug";
import type { Tx } from "./save";

/**
 * The caller's brand of this name (matched without regard to case, as the
 * column is citext), created if it is new, and whether this call created it.
 * Runs in the caller's transaction so a label that then fails to save leaves no
 * stray brand behind.
 *
 * Safe when two saves of the same new brand run at once: the insert does nothing
 * if the name (or the slug) is already taken, waiting for the other save to
 * finish first, and then the brand is looked up again. Looking up first and
 * inserting after would let both miss it and the second fail on the unique key.
 */
export async function ensureBrand(tx: Tx, ownerId: number, name: string): Promise<{ id: number; created: boolean }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [found] = await tx
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.ownerId, ownerId), eq(brands.name, name)))
      .limit(1);
    if (found) return { id: found.id, created: false };

    const slug = await resolveSlug({
      table: brands,
      column: brands.slug,
      idColumn: brands.id,
      scope: { column: brands.ownerId, value: ownerId },
      requested: null,
      fallbackFrom: name,
    });
    const [row] = await tx.insert(brands).values({ ownerId, name, slug }).onConflictDoNothing().returning({ id: brands.id });
    if (row) return { id: row.id, created: true };
    // Lost the race for the name, or for the slug: look again, with a fresh slug if it was the slug.
  }
  throw new Error(`Could not create the brand "${name}".`);
}

/** The caller's brand of this name, created if it is new. */
export async function findOrCreateBrand(tx: Tx, ownerId: number, name: string): Promise<number> {
  return (await ensureBrand(tx, ownerId, name)).id;
}
