import { z } from "zod";

/** A scanned or typed barcode as digits only (spaces and dashes dropped), or null if it can't be one. */
export function normalizeUpc(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/[\s-]/g, "");
  return /^[0-9]{6,32}$/.test(digits) ? digits : null;
}

/**
 * Every stored form a scanned code may be saved under. A UPC-A (12 digits) is
 * the same product as the EAN-13 with a leading zero (13 digits), and iOS
 * reports UPC-A that way, so a label typed in as 12 digits must still match.
 */
export function upcCandidates(digits: string): string[] {
  const forms = new Set([digits]);
  if (digits.length === 13 && digits.startsWith("0")) forms.add(digits.slice(1));
  if (digits.length === 12) forms.add(`0${digits}`);
  return [...forms];
}

/** The few fields the phone sends to start a label; the rest are filled in on the web. */
export const newLabelSchema = z.object({
  brand: z.string().trim().min(1, "Enter a brand.").max(120, "Keep this under 120 characters."),
  name: z.string().trim().min(1, "Enter a name.").max(160, "Keep this under 160 characters."),
  categoryId: z.coerce.number({ message: "Pick a category." }).int("Pick a category.").positive("Pick a category."),
  upc: z
    .string()
    .nullish()
    .transform((value, ctx) => {
      if (value === null || value === undefined || value.trim() === "") return null;
      const digits = normalizeUpc(value);
      if (digits === null) ctx.addIssue({ code: "custom", message: "A barcode is 6–32 digits." });
      return digits;
    }),
});

export type NewLabel = z.infer<typeof newLabelSchema>;

/** The body of "save this scanned barcode onto a label". */
export const attachBarcodeSchema = z.object({
  upc: z.string({ message: "A barcode is 6–32 digits." }).transform((value, ctx) => {
    const digits = normalizeUpc(value);
    if (digits === null) {
      ctx.addIssue({ code: "custom", message: "A barcode is 6–32 digits." });
      return z.NEVER;
    }
    return digits;
  }),
});
