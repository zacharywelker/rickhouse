import { z } from "zod";
import { bottleBase } from "@/lib/expressions/schema";

/**
 * What can change on a bottle, partially. A field that is not listed is refused rather than quietly ignored, and a
 * field sent as `null` clears it. Status is never set directly: it follows the level and the Opened date.
 *
 * Shared by the phone API (`PATCH /api/v1/bottles/:id`) and the bulk editor, so both take exactly the same
 * fields. The label's own facts (name, brand, category, MSRP) are not here, so a bottle request cannot change them.
 */
export const bottlePatchSchema = bottleBase
  .pick({
    pricePaid: true, storeId: true, dateAcquired: true, location: true, notes: true, batch: true, releaseYear: true, barrelNumber: true,
    pickName: true, barrelFilledOn: true, bottledOn: true,
    expressionId: true, releaseId: true, acquisition: true, isSingleBarrel: true, isSingleBarrelPick: true, pickedBy: true,
    warehouse: true, rickFloor: true, bottleCount: true, sizeMl: true, proof: true, ageYears: true, ageMonths: true, ageDays: true,
    ageStatement: true, tequilaClass: true, brandyGrade: true, ginIsNas: true,
  })
  .extend({
    fillPct: z.number().int().min(0).max(100),
    dateOpened: z.string().nullable(),
    ifOpenedCleared: z.enum(["keep_open", "seal"]),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Send at least one field to change.");
