"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { distilleries } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { RESOURCES, isResourceKey } from "@/lib/admin/registry";
import { quickCreateSchema } from "@/lib/admin/schemas";
import { normalizePlace, samePlace, undisclosedName } from "@/lib/places";
import { resolveSlug } from "@/lib/slug";
import {
  REFERENCE_RESOURCES,
  type ActionResult,
  DETAILED_RESOURCES,
  type DetailedResource,
  type QuickCreateResult,
  type ResourceFormSpec,
  type ReferenceResource,
} from "@/lib/admin/types";

/** Categories are one tree shared by every account, so only admins change it. */
const SHARED_ONLY_ADMIN_EDITS = "Categories are shared by everyone here, so only an admin can change them.";

function unknownResource(key: string): ActionResult {
  console.warn("[rickhouse] rejected admin action for unknown resource", key);
  return { ok: false, error: "That is not something this app manages." };
}

/**
 * One action behind every taxonomy form. The resource key is checked against
 * the registry before anything touches the database, so a tampered form
 * cannot reach a table the admin section does not expose.
 */
export async function saveResourceAction(
  key: string,
  id: number | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireSession();
  if (!isResourceKey(key)) return unknownResource(key);
  if (key === "categories" && user.role !== "admin") return { ok: false, error: SHARED_ONLY_ADMIN_EDITS };

  const config = RESOURCES[key];
  const raw = Object.fromEntries(formData.entries());

  try {
    const outcome = await config.save(raw, id, user.id);
    if (!outcome.ok) {
      return { ok: false, error: outcome.error, ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}) };
    }
    revalidatePath(`/admin/${key}`);
    revalidatePath("/");
    return {
      ok: true,
      message: id === null ? `${config.singular} created.` : `${config.singular} saved.`,
      createdId: outcome.id,
    };
  } catch (error: unknown) {
    return mapDbError(error, { singular: config.singular });
  }
}

export async function deleteResourceAction(key: string, id: number): Promise<ActionResult> {
  const user = await requireSession();
  if (!isResourceKey(key)) return unknownResource(key);
  if (key === "categories" && user.role !== "admin") return { ok: false, error: SHARED_ONLY_ADMIN_EDITS };

  const config = RESOURCES[key];
  try {
    await config.remove(id, user.id);
    revalidatePath(`/admin/${key}`);
    revalidatePath("/");
    return { ok: true, message: `${config.singular} deleted.` };
  } catch (error: unknown) {
    return mapDbError(error, { singular: config.singular });
  }
}

/**
 * Defaults for rows created inline from a picker. Everything else on these
 * tables is nullable or has a database default, so a name is genuinely all we
 * need — the point is not to interrupt what you were doing.
 */
const QUICK_CREATE_DEFAULTS: Record<ReferenceResource, Record<string, string>> = {
  categories: { fieldGroup: "other" },
  companies: {},
  brands: {},
  distilleries: { country: "USA" },
  finishes: { finishType: "other" },
  stores: {},
  tags: {},
};

function isReferenceResource(value: string): value is ReferenceResource {
  return (REFERENCE_RESOURCES as readonly string[]).includes(value);
}

/** Creates a lookup row from just a name, without leaving the form you are on. */
export async function quickCreateAction(resource: string, name: string): Promise<QuickCreateResult> {
  const user = await requireSession();
  if (!isReferenceResource(resource)) return { ok: false, error: "That is not something this app manages." };
  if (resource === "categories" && user.role !== "admin") return { ok: false, error: SHARED_ONLY_ADMIN_EDITS };

  const parsed = quickCreateSchema.safeParse({ name });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That name will not work." };
  }

  const config = RESOURCES[resource];
  try {
    const outcome = await config.save({ name: parsed.data.name, ...QUICK_CREATE_DEFAULTS[resource] }, null, user.id);
    if (!outcome.ok) return { ok: false, error: outcome.error };
    revalidatePath(`/admin/${resource}`);
    return { ok: true, option: { value: outcome.id, label: parsed.data.name } };
  } catch (error: unknown) {
    const mapped = mapDbError(error, { singular: config.singular });
    return { ok: false, error: mapped.ok ? "Could not create that." : mapped.error };
  }
}

const undisclosedPlaceSchema = z.object({
  city: z.string().trim().max(80, "Keep the city under 80 characters.").default(""),
  state: z.string().trim().max(60, "Keep the state under 60 characters.").default(""),
  country: z.string().trim().max(80, "Keep the country under 80 characters.").default(""),
});

/**
 * "Not disclosed": the placeholder distillery for a label that names only a
 * place. Finds the account's existing one for that place, whatever way its state
 * was spelled, or creates it, so "NY", "ny" and "New York" are one row.
 */
export async function findOrCreateUndisclosedAction(input: {
  city: string;
  state: string;
  country: string;
}): Promise<QuickCreateResult> {
  const user = await requireSession();
  const parsed = undisclosedPlaceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That place will not work." };

  const place = normalizePlace(parsed.data);
  const name = undisclosedName(place);
  // The row's own name: one made by hand as "Undisclosed (IN)" keeps it.
  const option = (id: number, label: string = name) => ({ value: id, label, undisclosed: true });

  try {
    const existing = await db
      .select({
        id: distilleries.id,
        name: distilleries.name,
        city: distilleries.city,
        state: distilleries.state,
        country: distilleries.country,
      })
      .from(distilleries)
      .where(and(eq(distilleries.ownerId, user.id), eq(distilleries.disclosure, "undisclosed")));
    // Compared as places, so one made by hand as "Undisclosed (IN)" still counts.
    const match = existing.find((row) => samePlace(normalizePlace(row), place));
    if (match) return { ok: true, option: option(match.id, match.name) };

    // A row already called exactly this, made by hand before there was a
    // Disclosure setting, is the placeholder: adopt it rather than trip the
    // unique name.
    const [sameName] = await db
      .select({ id: distilleries.id, name: distilleries.name })
      .from(distilleries)
      .where(and(eq(distilleries.ownerId, user.id), eq(distilleries.name, name)))
      .limit(1);
    if (sameName) {
      await db
        .update(distilleries)
        .set({ disclosure: "undisclosed", city: place.city, state: place.state, country: place.country })
        .where(eq(distilleries.id, sameName.id));
      revalidatePath("/admin/distilleries");
      return { ok: true, option: option(sameName.id, sameName.name) };
    }

    const slug = await resolveSlug({
      table: distilleries,
      column: distilleries.slug,
      idColumn: distilleries.id,
      scope: { column: distilleries.ownerId, value: user.id },
      requested: null,
      fallbackFrom: name,
    });
    const [row] = await db
      .insert(distilleries)
      .values({
        ownerId: user.id,
        name,
        slug,
        city: place.city,
        state: place.state,
        country: place.country,
        disclosure: "undisclosed",
      })
      .returning({ id: distilleries.id });
    revalidatePath("/admin/distilleries");
    return { ok: true, option: option(row!.id) };
  } catch (error: unknown) {
    const mapped = mapDbError(error, { singular: "Distillery" });
    return { ok: false, error: mapped.ok ? "Could not add that." : mapped.error };
  }
}

function isDetailedResource(value: string): value is DetailedResource {
  return (DETAILED_RESOURCES as readonly string[]).includes(value);
}

/** What the full form of a company, brand, distillery or mashbill needs, for a dialog opened from a picker. */
export async function resourceFormSpecAction(resource: string): Promise<ResourceFormSpec> {
  const user = await requireSession();
  if (!isDetailedResource(resource)) return { ok: false, error: "That is not something this app manages." };
  const config = RESOURCES[resource];
  return { ok: true, singular: config.singular, fields: config.fields, options: await config.optionsFor(user.id) };
}

/** A row just made with its full form, as the option a picker chooses. */
export async function createdOptionAction(resource: string, id: number): Promise<QuickCreateResult> {
  const user = await requireSession();
  if (!isDetailedResource(resource)) return { ok: false, error: "That is not something this app manages." };
  const rows = await RESOURCES[resource].list(user.id);
  const row = rows.find((r) => r.id === id);
  if (!row) return { ok: false, error: "That was created but could not be found." };
  return { ok: true, option: { value: id, label: String(row.cells.name ?? "") } };
}
