import "server-only";
import { and, asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bottleList, bottles, expressionNames, expressionReleases, expressions, stores, type FieldGroup } from "@/db/schema";
import { REFERENCE_OPTION_LOADERS } from "@/lib/admin/registry";
import { DEFAULT_STATUSES } from "@/lib/bottles/filters";
import { parseLabelFilters } from "@/lib/expressions/filters";
import { categoryFieldGroups, categoryKindsById, queryExpressions } from "@/lib/expressions/queries";
import type { CategoryChoice } from "./drafts";
import type { SheetBottle, SheetLabel, SheetPhoto } from "./sheet";
import type { RefData } from "./references";

/** More rows than anyone owns: the editor is one scroll, not pages. */
const EVERYTHING = 100_000;

/**
 * What the bulk editor shows, for one account: every label (the same rows, with the same links, as the Labels table),
 * and the bottles the Collection lists by default (on the shelf: owned and open). The bottles come raw, from the
 * bottles table rather than the Collection's view, because that view blends a label's value with a bottle's own and
 * the sheet has to keep them apart. Ordering is the sheet's business (`sheetRows`).
 */
export async function loadSheet(ownerId: number): Promise<{
  labels: SheetLabel[];
  bottles: SheetBottle[];
  kinds: Awaited<ReturnType<typeof categoryKindsById>>;
  /** The account's brands and the categories, the same lists the label form picks from. */
  brands: Array<{ id: number; name: string }>;
  categories: CategoryChoice[];
  groups: Record<number, FieldGroup>;
  /** Thumbnails for the rail: a bottle's (its own, else its release's, else its label's, as the Collection shows) and a label's own. Only those that have one. */
  photos: { bottles: Record<number, SheetPhoto>; labels: Record<number, SheetPhoto> };
  /** What the picking cells choose from: the account's stores and cooperages, and each label's own releases and older names. */
  refs: RefData;
}> {
  const [{ rows: labels }, bottleRows, kinds, brandOptions, categoryOptions, groups, bottlePhotos, labelPhotos, storeOptions, cooperageOptions, releaseRows, nameRows] = await Promise.all([
    queryExpressions({ ...parseLabelFilters({}), pageSize: EVERYTHING }, ownerId),
    db
      .select({
        id: bottles.id,
        expressionId: bottles.expressionId,
        storeId: bottles.storeId,
        releaseId: bottles.releaseId,
        expressionNameId: bottles.expressionNameId,
        status: bottles.status,
        pricePaid: bottles.pricePaid,
        storeName: stores.name,
        dateAcquired: bottles.dateAcquired,
        isSingleBarrel: bottles.isSingleBarrel,
        isSingleBarrelPick: bottles.isSingleBarrelPick,
        pickName: bottles.pickName,
        releaseYear: bottles.releaseYear,
        location: bottles.location,
        notes: bottles.notes,
        sizeMl: bottles.sizeMl,
        proof: bottles.proof,
        ageYears: bottles.ageYears,
        ageMonths: bottles.ageMonths,
        ageDays: bottles.ageDays,
        ageStatement: bottles.ageStatement,
        acquisition: bottles.acquisition,
        batch: bottles.batch,
        pickedBy: bottles.pickedBy,
        barrelNumber: bottles.barrelNumber,
        bottleCount: bottles.bottleCount,
        warehouse: bottles.warehouse,
        rickFloor: bottles.rickFloor,
        barrelFilledOn: bottles.barrelFilledOn,
        bottledOn: bottles.bottledOn,
        ginIsNas: bottles.ginIsNas,
        tequilaClass: bottles.tequilaClass,
        brandyGrade: bottles.brandyGrade,
        fillPct: bottles.fillPct,
        isOpen: bottles.isOpen,
        dateOpened: bottles.dateOpened,
        dateKilled: bottles.dateKilled,
        isFavorite: bottles.isFavorite,
      })
      .from(bottles)
      .leftJoin(stores, eq(stores.id, bottles.storeId))
      .where(and(eq(bottles.ownerId, ownerId), inArray(bottles.status, DEFAULT_STATUSES)))
      .orderBy(asc(bottles.id)),
    categoryKindsById(),
    REFERENCE_OPTION_LOADERS.brands(ownerId),
    REFERENCE_OPTION_LOADERS.categories(ownerId),
    categoryFieldGroups(),
    db
      .select({ id: bottleList.id, path: bottleList.thumbPath, isCutout: bottleList.thumbIsCutout })
      .from(bottleList)
      .where(and(eq(bottleList.ownerId, ownerId), isNotNull(bottleList.thumbPath))),
    db
      .select({ id: expressions.id, path: sql<string | null>`coalesce(${expressions.photoThumbPath}, ${expressions.photoPath})`, isCutout: expressions.photoIsCutout })
      .from(expressions)
      .where(and(eq(expressions.ownerId, ownerId), or(isNotNull(expressions.photoThumbPath), isNotNull(expressions.photoPath)))),
    REFERENCE_OPTION_LOADERS.stores(ownerId),
    REFERENCE_OPTION_LOADERS.cooperages(ownerId),
    db
      .select({ id: expressionReleases.id, labelId: expressionReleases.expressionId, name: expressionReleases.name })
      .from(expressionReleases)
      .innerJoin(expressions, eq(expressions.id, expressionReleases.expressionId))
      .where(eq(expressions.ownerId, ownerId))
      .orderBy(asc(expressionReleases.name)),
    db
      .select({ id: expressionNames.id, labelId: expressionNames.expressionId, name: expressionNames.name })
      .from(expressionNames)
      .innerJoin(expressions, eq(expressions.id, expressionNames.expressionId))
      .where(eq(expressions.ownerId, ownerId))
      .orderBy(asc(expressionNames.position), asc(expressionNames.name)),
  ]);
  const byLabel = (rows: Array<{ id: number; labelId: number; name: string }>): Record<number, Array<{ id: number; name: string }>> => {
    const out: Record<number, Array<{ id: number; name: string }>> = {};
    for (const r of rows) (out[r.labelId] ??= []).push({ id: r.id, name: r.name });
    return out;
  };
  const photoMap = (rows: Array<{ id: number; path: string | null; isCutout: boolean | null }>): Record<number, SheetPhoto> =>
    Object.fromEntries(rows.filter((r) => r.path !== null).map((r) => [r.id, { path: r.path!, isCutout: r.isCutout }]));
  return {
    labels,
    bottles: bottleRows,
    kinds,
    brands: brandOptions.map((o) => ({ id: o.value, name: o.label })),
    categories: categoryOptions.map((o) => ({ id: o.value, name: o.label, ...(o.hint ? { hint: o.hint } : {}) })),
    groups,
    photos: { bottles: photoMap(bottlePhotos), labels: photoMap(labelPhotos) },
    refs: {
      stores: storeOptions.map((o) => ({ id: o.value, name: o.label, ...(o.hint ? { hint: o.hint } : {}) })),
      cooperages: cooperageOptions.map((o) => ({ id: o.value, name: o.label })),
      releases: byLabel(releaseRows),
      versions: byLabel(nameRows),
    },
  };
}
