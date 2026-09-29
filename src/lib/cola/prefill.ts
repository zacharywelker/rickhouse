import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import type { Option } from "@/lib/admin/types";
import { ColaLookupError, ColaNotFoundError, ColaParseError, lookupCola } from "./client";
import { normalizeTtbId } from "./ids";
import { suggestLabel } from "./map";
import { colaLookupEnabled } from "./store";

export type ColaPrefill =
  | {
      ok: true;
      ttbId: string;
      /** Form values to start the new label with. */
      values: Record<string, string | number | null>;
      summary: { brand: string | null; name: string | null; classType: string | null; applicant: string | null };
      /** The COLA's brand, when no brand of that name exists yet. */
      missingBrand: string | null;
    }
  /** `ttbId` is set when the ID is worth attaching anyway (lookups off, registry unreachable). */
  | { ok: false; ttbId: string | null; error: string };

/**
 * "Start from a TTB ID" on the new label page (SPEC M11): looks the COLA up
 * (the record only; images come once the label exists) and turns it into
 * starting values. Brand and category are only filled when they match
 * something that already exists: a new brand is the person's call.
 */
export async function prefillFromCola(input: string, brandOptions: Option[]): Promise<ColaPrefill> {
  const ttbId = normalizeTtbId(input);
  if (!ttbId) return { ok: false, ttbId: null, error: "A TTB ID is 14 digits, like 21132001000620." };
  if (!colaLookupEnabled()) {
    return { ok: false, ttbId, error: "COLA lookups are turned off on this server. The ID is still added to the label." };
  }

  let lookup;
  try {
    lookup = await lookupCola(ttbId, { images: false });
  } catch (error: unknown) {
    if (error instanceof ColaNotFoundError) return { ok: false, ttbId: null, error: error.message };
    if (error instanceof ColaParseError || error instanceof ColaLookupError) {
      return { ok: false, ttbId, error: `${error.message} The ID is still added to the label.` };
    }
    console.warn("[rickhouse] COLA prefill failed", ttbId, error);
    return { ok: false, ttbId, error: "The COLA lookup failed. The ID is still added to the label." };
  }

  const { record } = lookup;
  const suggestion = suggestLabel(record);

  const brand = suggestion.brandName
    ? brandOptions.find((option) => option.label.localeCompare(suggestion.brandName!, undefined, { sensitivity: "base" }) === 0)
    : undefined;

  const [category] = suggestion.categorySlug
    ? await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, suggestion.categorySlug)).limit(1)
    : [];

  return {
    ok: true,
    ttbId,
    values: {
      name: suggestion.name,
      brandId: brand?.value ?? null,
      categoryId: category?.id ?? null,
    },
    summary: {
      brand: suggestion.brandName,
      name: suggestion.name,
      classType: record.classType,
      applicant: record.applicantName,
    },
    missingBrand: brand ? null : suggestion.brandName,
  };
}
