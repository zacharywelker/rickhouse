"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/currency";
import { requireSession } from "@/lib/auth";
import { updatePreferences } from "@/lib/preferences";
import type { ActionResult } from "@/lib/admin/types";

const patchSchema = z
  .object({ searchFirstAdd: z.boolean(), currency: z.enum(CURRENCY_CODES) })
  .partial()
  .strict();

/** Each account's own; one person trying a page never changes it for the rest of the household. */
export async function savePreferencesAction(patch: unknown): Promise<ActionResult> {
  const user = await requireSession();
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "That is not a setting." };
  await updatePreferences(user.id, parsed.data);
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}
