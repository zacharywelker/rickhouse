import "server-only";
import type { bottles } from "@/db/schema";
import { settleLabelChoices } from "@/lib/expressions/label-choices";
import { fieldErrorsOf } from "@/lib/expressions/save";
import { bottleSchema, bottleStateSchema } from "@/lib/expressions/schema";
import type { CategoryKind } from "@/lib/expressions/rules";
import { withBottleSpiritFacts } from "@/lib/expressions/spirit-details";
import { settleNewBottleOpen } from "./opened-rules";

export type NewBottleValues = Omit<typeof bottles.$inferInsert, "ownerId">;

export type NewBottle =
  | { ok: true; values: NewBottleValues }
  | { ok: false; error: string; fieldErrors: Record<string, string> };

/**
 * A new bottle's columns from a row of the sheet: the bottle form's fields plus where it is in its life
 * (`bottleStateSchema`), validated by the same rules as the form, on the label `expressionId`.
 *
 * `acquisition` and `status` default to a purchase that is merely owned, as a new row of the old grid did. Whatever
 * label the row names is ignored: the bottle goes on `expressionId`, which the caller has already checked is the
 * caller's. The label's spirit is passed in because the label may not be visible to a query yet (it is created
 * in the same transaction).
 */
export async function newBottleValues(
  raw: Record<string, unknown>,
  expressionId: number,
  spirit: { kind: CategoryKind; ginAged: boolean },
): Promise<NewBottle> {
  const row = { acquisition: "purchase", status: "owned", ...raw, expressionId };
  const parsed = bottleSchema.safeParse(row);
  const state = bottleStateSchema.safeParse(row);
  if (!parsed.success || !state.success) {
    const issues = [...(parsed.success ? [] : parsed.error.issues), ...(state.success ? [] : state.error.issues)];
    return { ok: false, error: issues[0]?.message ?? "Please check the highlighted fields.", fieldErrors: fieldErrorsOf(issues) };
  }
  const settled = await settleLabelChoices(parsed.data);
  const values = settleNewBottleOpen(
    { ...withBottleSpiritFacts(settled, spirit.kind, spirit.ginAged), ...state.data },
    new Date().toISOString().slice(0, 10),
  );
  return { ok: true, values: values as NewBottleValues };
}
