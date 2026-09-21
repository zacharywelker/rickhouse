"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { RESOURCES, isResourceKey } from "@/lib/admin/registry";
import { quickCreateSchema } from "@/lib/admin/schemas";
import { REFERENCE_RESOURCES, type ActionResult, type QuickCreateResult, type ReferenceResource } from "@/lib/admin/types";

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
  await requireSession();
  if (!isResourceKey(key)) return unknownResource(key);

  const config = RESOURCES[key];
  const raw = Object.fromEntries(formData.entries());

  try {
    const outcome = await config.save(raw, id);
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
  await requireSession();
  if (!isResourceKey(key)) return unknownResource(key);

  const config = RESOURCES[key];
  try {
    await config.remove(id);
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
  await requireSession();
  if (!isReferenceResource(resource)) return { ok: false, error: "That is not something this app manages." };

  const parsed = quickCreateSchema.safeParse({ name });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That name will not work." };
  }

  const config = RESOURCES[resource];
  try {
    const outcome = await config.save({ name: parsed.data.name, ...QUICK_CREATE_DEFAULTS[resource] }, null);
    if (!outcome.ok) return { ok: false, error: outcome.error };
    revalidatePath(`/admin/${resource}`);
    return { ok: true, option: { value: outcome.id, label: parsed.data.name } };
  } catch (error: unknown) {
    const mapped = mapDbError(error, { singular: config.singular });
    return { ok: false, error: mapped.ok ? "Could not create that." : mapped.error };
  }
}
