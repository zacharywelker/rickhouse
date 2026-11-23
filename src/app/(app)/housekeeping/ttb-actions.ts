"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import type { ActionResult } from "@/lib/admin/types";
import { dismiss } from "@/lib/housekeeping/dismissals";
import { labelBelongsTo, TTB_SCOPE } from "@/lib/housekeeping/ttb-queries";

const idOf = (value: unknown): number | null => (typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null);

/**
 * Marks a label "Not on TTB" so the Housekeeping list stops offering it. The account is the signed-in one, never
 * anything in the request; the label must be that account's. The label itself is untouched, and an approval can still
 * be added on its own page. `name` is only echoed back in the message, tidied and capped, never stored.
 */
export async function dismissTtbAction(input: { expressionId: number; name?: string }): Promise<ActionResult> {
  const user = await requireSession();
  const expressionId = idOf(input?.expressionId);
  if (!expressionId) return { ok: false, error: "That request did not make sense. Reload the page and try again." };
  const name = (typeof input.name === "string" ? input.name : "").replace(/\s+/g, " ").trim().slice(0, 200) || "that label";

  try {
    if (!(await labelBelongsTo(user.id, expressionId))) {
      revalidatePath("/housekeeping"); // the dead row should leave the list
      return { ok: false, error: "That label is gone." };
    }
    await dismiss(user.id, TTB_SCOPE, String(expressionId));
    revalidatePath("/housekeeping");
    return { ok: true, message: `Marked “${name}” as not on TTB. It won’t be listed again.` };
  } catch (error) {
    console.error("[housekeeping] marking a label as not on TTB failed", error);
    return { ok: false, error: "That did not save. Try again." };
  }
}
