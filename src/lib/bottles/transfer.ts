import "server-only";
import { asc, eq, sql, type Table } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  ACQUISITIONS,
  BOTTLE_STATUSES,
  bottles,
  brands,
  categories,
  distilleries,
  expressionDistilleries,
  expressionFinishes,
  expressions,
  finishes,
  stores,
  type Acquisition,
  type BottleStatus,
} from "@/db/schema";
import { parseCsvRows, toCsv } from "@/lib/csv";
import { slugify } from "@/lib/utils";

/**
 * CSV in and out.
 *
 * Export is the whole collection flattened, one row per bottle. Import is the
 * same shape, so a round trip is lossless for everything the columns cover —
 * which makes the export the documentation for the import.
 */

export const TRANSFER_HEADERS = [
  "brand",
  "expression",
  "batch",
  "category",
  "proof",
  "age_statement",
  "msrp",
  "upc",
  "distilleries",
  "finishes",
  "price_paid",
  "store",
  "date_acquired",
  "acquisition",
  "status",
  "fill_pct",
  "is_open",
  "location",
  "notes",
] as const;

export async function exportBottlesCsv(): Promise<string> {
  const rows = await db
    .select({
      brand: brands.name,
      expression: expressions.name,
      batch: expressions.batch,
      category: categories.name,
      proof: expressions.proof,
      ageStatement: expressions.ageStatement,
      msrp: expressions.msrp,
      upc: expressions.upc,
      pricePaid: bottles.pricePaid,
      store: stores.name,
      dateAcquired: bottles.dateAcquired,
      acquisition: bottles.acquisition,
      status: bottles.status,
      fillPct: bottles.fillPct,
      isOpen: bottles.isOpen,
      location: bottles.location,
      notes: bottles.notes,
      distilleries: sql<string | null>`(
        SELECT string_agg(d.name, '; ' ORDER BY ed.position)
          FROM expression_distilleries ed
          JOIN distilleries d ON d.id = ed.distillery_id
         WHERE ed.expression_id = ${expressions.id})`,
      finishes: sql<string | null>`(
        SELECT string_agg(f.name, '; ' ORDER BY ef.position)
          FROM expression_finishes ef
          JOIN finishes f ON f.id = ef.finish_id
         WHERE ef.expression_id = ${expressions.id})`,
    })
    .from(bottles)
    .innerJoin(expressions, eq(bottles.expressionId, expressions.id))
    .innerJoin(brands, eq(expressions.brandId, brands.id))
    .innerJoin(categories, eq(expressions.categoryId, categories.id))
    .leftJoin(stores, eq(bottles.storeId, stores.id))
    .orderBy(asc(brands.name), asc(expressions.name), asc(bottles.id));

  return toCsv(
    [...TRANSFER_HEADERS],
    rows.map((row) => [
      row.brand,
      row.expression,
      row.batch,
      row.category,
      row.proof,
      row.ageStatement,
      row.msrp,
      row.upc,
      row.distilleries,
      row.finishes,
      row.pricePaid,
      row.store,
      row.dateAcquired,
      row.acquisition,
      row.status,
      row.fillPct,
      row.isOpen ? "true" : "false",
      row.location,
      row.notes,
    ]),
  );
}

export type ImportOutcome = {
  line: number;
  label: string;
  status: "created" | "skipped" | "failed";
  detail: string;
};

export type ImportReport = {
  created: number;
  skipped: number;
  failed: number;
  outcomes: ImportOutcome[];
};

const list = (value: string): string[] =>
  value
    .split(/[;|]/)
    .map((part) => part.trim())
    .filter((part) => part !== "");

const numberOrNull = (value: string): string | null => {
  if (value.trim() === "") return null;
  const n = Number(value.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? String(n) : null;
};

/** Finds a row by case-insensitive name, creating it if it is missing. */
async function findOrCreate(
  kind: "brand" | "distillery" | "store" | "finish",
  name: string,
): Promise<number> {
  if (kind === "brand") {
    const [found] = await db.select({ id: brands.id }).from(brands).where(eq(brands.name, name)).limit(1);
    if (found) return found.id;
    const [row] = await db
      .insert(brands)
      .values({ name, slug: await freeSlug(brands, brands.slug, name) })
      .returning({ id: brands.id });
    return row!.id;
  }
  if (kind === "distillery") {
    const [found] = await db
      .select({ id: distilleries.id })
      .from(distilleries)
      .where(eq(distilleries.name, name))
      .limit(1);
    if (found) return found.id;
    const [row] = await db
      .insert(distilleries)
      .values({ name, slug: await freeSlug(distilleries, distilleries.slug, name), country: "USA" })
      .returning({ id: distilleries.id });
    return row!.id;
  }
  if (kind === "finish") {
    const [found] = await db.select({ id: finishes.id }).from(finishes).where(eq(finishes.name, name)).limit(1);
    if (found) return found.id;
    const [row] = await db
      .insert(finishes)
      .values({ name, slug: await freeSlug(finishes, finishes.slug, name), finishType: "other" })
      .returning({ id: finishes.id });
    return row!.id;
  }
  const [found] = await db.select({ id: stores.id }).from(stores).where(eq(stores.name, name)).limit(1);
  if (found) return found.id;
  const [row] = await db
    .insert(stores)
    .values({ name, slug: await freeSlug(stores, stores.slug, name) })
    .returning({ id: stores.id });
  return row!.id;
}

/** A slug not already taken in `table`, suffixed until it is free. */
async function freeSlug(table: Table, column: PgColumn, from: string): Promise<string> {
  const base = slugify(from) || "item";
  for (let suffix = 0; suffix < 200; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    if ((await db.$count(table, eq(column, candidate))) === 0) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export async function importBottlesCsv(text: string): Promise<ImportReport> {
  const { rows } = parseCsvRows(text);
  const outcomes: ImportOutcome[] = [];

  for (const [index, row] of rows.entries()) {
    // +2: one for the header, one because humans count from one.
    const line = index + 2;
    const brandName = row.brand ?? "";
    const expressionName = row.expression ?? "";
    const label = `${brandName} ${expressionName}`.trim() || "(unnamed)";

    if (brandName === "" || expressionName === "") {
      outcomes.push({ line, label, status: "failed", detail: "A brand and an expression name are required." });
      continue;
    }

    try {
      const categoryName = row.category ?? "";
      const [category] = categoryName
        ? await db.select({ id: categories.id }).from(categories).where(eq(categories.name, categoryName)).limit(1)
        : [];
      if (!category) {
        outcomes.push({
          line,
          label,
          status: "failed",
          detail: categoryName
            ? `No category called "${categoryName}". Create it under Configuration first.`
            : "A category is required.",
        });
        continue;
      }

      const brandId = await findOrCreate("brand", brandName);
      const batch = (row.batch ?? "").trim() || null;

      // Match an existing expression on brand + name + batch, which is the
      // same key the table uses, so a re-import updates nothing and adds a
      // bottle rather than duplicating the product.
      const existing = await db
        .select({ id: expressions.id })
        .from(expressions)
        .where(
          sql`${expressions.brandId} = ${brandId} AND ${expressions.name} = ${expressionName}
              AND ${expressions.batch} IS NOT DISTINCT FROM ${batch}`,
        )
        .limit(1);

      let expressionId = existing[0]?.id;
      if (expressionId === undefined) {
        const [created] = await db
          .insert(expressions)
          .values({
            brandId,
            categoryId: category.id,
            name: expressionName,
            batch,
            slug: await freeSlug(expressions, expressions.slug, `${expressionName} ${batch ?? ""}`),
            proof: numberOrNull(row.proof ?? ""),
            ageStatement: (row.age_statement ?? "").trim() || null,
            msrp: numberOrNull(row.msrp ?? ""),
            upc: (row.upc ?? "").trim() || null,
          })
          .returning({ id: expressions.id });
        expressionId = created!.id;

        for (const [position, name] of list(row.distilleries ?? "").entries()) {
          await db
            .insert(expressionDistilleries)
            .values({ expressionId, distilleryId: await findOrCreate("distillery", name), position })
            .onConflictDoNothing();
        }
        for (const [position, name] of list(row.finishes ?? "").entries()) {
          await db
            .insert(expressionFinishes)
            .values({ expressionId, finishId: await findOrCreate("finish", name), position })
            .onConflictDoNothing();
        }
      }

      const storeName = (row.store ?? "").trim();
      const acquisition = (row.acquisition ?? "").trim().toLowerCase();
      const status = (row.status ?? "").trim().toLowerCase();
      const fill = Number(row.fill_pct ?? "");

      await db.insert(bottles).values({
        expressionId,
        pricePaid: numberOrNull(row.price_paid ?? ""),
        storeId: storeName ? await findOrCreate("store", storeName) : null,
        dateAcquired: /^\d{4}-\d{2}-\d{2}$/.test(row.date_acquired ?? "") ? row.date_acquired! : null,
        acquisition: (ACQUISITIONS as readonly string[]).includes(acquisition)
          ? (acquisition as Acquisition)
          : "purchase",
        status: (BOTTLE_STATUSES as readonly string[]).includes(status) ? (status as BottleStatus) : "owned",
        fillPct: Number.isFinite(fill) ? Math.min(100, Math.max(0, Math.round(fill))) : 100,
        isOpen: (row.is_open ?? "").trim().toLowerCase() === "true",
        location: (row.location ?? "").trim() || null,
        notes: (row.notes ?? "").trim() || null,
      });

      outcomes.push({
        line,
        label,
        status: "created",
        detail: existing[0] ? "Added a bottle to the existing expression." : "Created the expression and a bottle.",
      });
    } catch (error: unknown) {
      console.error("[rickhouse] import row failed", line, error);
      outcomes.push({ line, label, status: "failed", detail: "Could not import this row." });
    }
  }

  return {
    created: outcomes.filter((o) => o.status === "created").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
    outcomes,
  };
}
