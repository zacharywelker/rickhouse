import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { distilleries } from "@/db/schema";
import { normalizePlace, samePlace, undisclosedName } from "@/lib/places";
import { resolveSlug } from "@/lib/slug";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The account's "Undisclosed (…)" placeholder for a place, made if it is missing.
 * What the label form's "Distillery not disclosed" tick turns into on save, so
 * "NY", "ny" and "New York" are one row and nothing is created for a form that
 * is abandoned.
 *
 * An existing placeholder is matched as a place, whatever way its state was
 * spelled, so one made by hand as "Undisclosed (IN)" is reused. A row already
 * called exactly the generated name, made before there was a Disclosure setting,
 * is adopted rather than left to trip the unique name.
 */
export async function undisclosedDistilleryId(
  executor: Executor,
  ownerId: number,
  input: { city?: string | null; state?: string | null; country?: string | null },
): Promise<number> {
  const place = normalizePlace(input);
  const name = undisclosedName(place);

  const existing = await executor
    .select({
      id: distilleries.id,
      city: distilleries.city,
      state: distilleries.state,
      country: distilleries.country,
    })
    .from(distilleries)
    .where(and(eq(distilleries.ownerId, ownerId), eq(distilleries.disclosure, "undisclosed")));
  const match = existing.find((row) => samePlace(normalizePlace(row), place));
  if (match) return match.id;

  const [sameName] = await executor
    .select({ id: distilleries.id })
    .from(distilleries)
    .where(and(eq(distilleries.ownerId, ownerId), eq(distilleries.name, name)))
    .limit(1);
  if (sameName) {
    await executor
      .update(distilleries)
      .set({ disclosure: "undisclosed", city: place.city, state: place.state, country: place.country })
      .where(eq(distilleries.id, sameName.id));
    return sameName.id;
  }

  const slug = await resolveSlug({
    table: distilleries,
    column: distilleries.slug,
    idColumn: distilleries.id,
    scope: { column: distilleries.ownerId, value: ownerId },
    requested: null,
    fallbackFrom: name,
  });
  const [row] = await executor
    .insert(distilleries)
    .values({
      ownerId,
      name,
      slug,
      city: place.city,
      state: place.state,
      country: place.country,
      disclosure: "undisclosed",
    })
    .returning({ id: distilleries.id });
  return row!.id;
}
