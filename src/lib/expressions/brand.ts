import "server-only";
import { and, eq } from "drizzle-orm";
import { brands } from "@/db/schema";
import { resolveSlug } from "@/lib/slug";
import type { Tx } from "./save";

/**
 * The caller's brand of this name (matched without regard to case, as the
 * column is citext), created if it is new. Runs in the caller's transaction so
 * a label that then fails to save leaves no stray brand behind.
 */
export async function findOrCreateBrand(tx: Tx, ownerId: number, name: string): Promise<number> {
  const [found] = await tx
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.ownerId, ownerId), eq(brands.name, name)))
    .limit(1);
  if (found) return found.id;

  const slug = await resolveSlug({
    table: brands,
    column: brands.slug,
    idColumn: brands.id,
    scope: { column: brands.ownerId, value: ownerId },
    requested: null,
    fallbackFrom: name,
  });
  const [row] = await tx.insert(brands).values({ ownerId, name, slug }).returning({ id: brands.id });
  return row!.id;
}
