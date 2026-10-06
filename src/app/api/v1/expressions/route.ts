import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { and, asc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { brands, categories, expressions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { apiError, issueFields, readJsonObject } from "@/lib/api/v1";
import { newLabelSchema, normalizeUpc, upcCandidates } from "@/lib/api/labels";
import { mapDbError } from "@/lib/db-errors";
import { findOrCreateBrand } from "@/lib/expressions/brand";
import { expressionSchema } from "@/lib/expressions/schema";
import { labelColumns, pickerLabel } from "@/lib/expressions/picker";
import { labelValues, writeLabel } from "@/lib/expressions/save";

export const dynamic = "force-dynamic";

const LIMIT = 30;

/** Thrown inside the transaction when the brand already has a label of this name. */
class DuplicateLabel extends Error {
  constructor(readonly labelId: number) {
    super("duplicate label");
  }
}

/**
 * Label search for the add-bottle picker: every word typed (`q`) has to appear
 * in the brand, the name or the category. `upc` finds labels by barcode instead
 * or as well: an exact match, where a 12-digit UPC-A and its 13-digit EAN form
 * count as the same code. A barcode that can't be one is a 422.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const params = request.nextUrl.searchParams;
  const words = (params.get("q") ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 8);
  const clauses: SQL[] = [
    eq(expressions.ownerId, user.id),
    ...words.map((word) => {
      const like = `%${word.replace(/[\\%_]/g, "\\$&")}%`;
      return or(ilike(brands.name, like), ilike(expressions.name, like), ilike(categories.name, like))!;
    }),
  ];

  const rawUpc = params.get("upc");
  if (rawUpc !== null && rawUpc.trim() !== "") {
    const digits = normalizeUpc(rawUpc);
    if (digits === null) return apiError(422, "invalid", "A barcode is 6–32 digits.", { upc: "A barcode is 6–32 digits." });
    clauses.push(inArray(expressions.upc, upcCandidates(digits)));
  }

  const rows = await db
    .select(labelColumns)
    .from(expressions)
    .innerJoin(brands, eq(brands.id, expressions.brandId))
    .innerJoin(categories, eq(categories.id, expressions.categoryId))
    .where(and(...clauses))
    .orderBy(asc(brands.name), asc(expressions.name))
    .limit(LIMIT);

  return NextResponse.json({ expressions: rows });
}

/**
 * Starts a label from the phone: a brand (by name; created if it is new), a
 * category, a name and, optionally, the scanned barcode. Everything else is
 * filled in later on the web. Saved through the web form's own path, so the
 * slug and the category's field group behave the same. Answers with the label
 * in the picker's shape.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const read = await readJsonObject(request);
  if ("error" in read) return read.error;

  const parsed = newLabelSchema.safeParse(read.body);
  if (!parsed.success) {
    return apiError(422, "invalid", parsed.error.issues[0]?.message ?? "Check the fields.", issueFields(parsed.error.issues));
  }
  const { brand, name, categoryId, upc } = parsed.data;

  const [category] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!category) return apiError(422, "invalid", "Pick a category.", { categoryId: "Pick a category." });

  try {
    const id = await db.transaction(async (tx) => {
      const brandId = await findOrCreateBrand(tx, user.id, brand);
      const [same] = await tx
        .select({ id: expressions.id })
        .from(expressions)
        .where(and(eq(expressions.ownerId, user.id), eq(expressions.brandId, brandId), eq(expressions.name, name)))
        .limit(1);
      if (same) throw new DuplicateLabel(same.id);
      const input = expressionSchema.parse({ brandId, categoryId, name, upc: upc ?? "" });
      const values = await labelValues(input, user.id, null);
      return writeLabel(tx, user.id, null, values, { distilleries: [], mashbills: [], finishes: [] });
    });

    revalidatePath("/expressions");
    const row = await pickerLabel(id, user.id);
    return NextResponse.json(row, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof DuplicateLabel) {
      // The label is already there: say so and hand it back, so the app can use it.
      const existing = await pickerLabel(error.labelId, user.id);
      return NextResponse.json(
        { error: { code: "duplicate", message: `You already have ${existing?.brand} ${existing?.name}.` }, existing },
        { status: 409 },
      );
    }
    const shaped = mapDbError(error, { singular: "Label" });
    return apiError(422, "invalid", shaped.ok ? "Could not save this label." : shaped.error);
  }
}
