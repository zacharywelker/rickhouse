import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { db } from "@/db";
import {
  FIELD_GROUPS,
  FINISH_TYPES,
  brands,
  bottleTags,
  bottles,
  categories,
  companies,
  distilleries,
  expressionDistilleries,
  expressionFinishes,
  expressionMashbills,
  expressions,
  finishes,
  mashbills,
  stores,
  tags,
} from "@/db/schema";
import { resolveSlug } from "@/lib/slug";
import { createsCycle } from "./tree";
import type { AdminRow, ColumnSpec, FieldSpec, Option } from "./types";
import {
  brandSchema,
  categorySchema,
  companySchema,
  distillerySchema,
  finishSchema,
  mashbillSchema,
  storeSchema,
  tagSchema,
} from "./schemas";

export const RESOURCE_KEYS = [
  "categories",
  "companies",
  "brands",
  "distilleries",
  "mashbills",
  "finishes",
  "stores",
  "tags",
] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];

export function isResourceKey(value: string): value is ResourceKey {
  return (RESOURCE_KEYS as readonly string[]).includes(value);
}

export type SaveOutcome =
  | { ok: true; id: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type ResourceConfig = {
  key: ResourceKey;
  label: string;
  singular: string;
  description: string;
  fields: FieldSpec[];
  columns: ColumnSpec[];
  list: () => Promise<AdminRow[]>;
  /** Options for every `reference` field on this resource, keyed by field name. */
  optionsFor: () => Promise<Record<string, Option[]>>;
  save: (raw: Record<string, unknown>, id: number | null) => Promise<SaveOutcome>;
  remove: (id: number) => Promise<void>;
};

// ------------------------------------------------------------
// Shared helpers
// ------------------------------------------------------------

function invalid(error: z.ZodError): SaveOutcome {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  const first = error.issues[0];
  return {
    ok: false,
    error: first ? first.message : "Please check the highlighted fields.",
    fieldErrors,
  };
}

const slugField: FieldSpec = {
  kind: "text",
  name: "slug",
  label: "URL slug",
  placeholder: "generated from the name",
  help: "Used in links. Leave blank and one is made for you.",
  span: "half",
};

const notesField: FieldSpec = { kind: "textarea", name: "notes", label: "Notes" };

const nameColumn: ColumnSpec = { key: "name", label: "Name" };

// ------------------------------------------------------------
// Categories
// ------------------------------------------------------------

const categoryParent = alias(categories, "category_parent");

const categoriesConfig: ResourceConfig = {
  key: "categories",
  label: "Categories",
  singular: "Category",
  description:
    "The spirit tree: Whiskey → American Whiskey → Bourbon, and later Rum → Jamaican → Pot Still. A category's field group decides which specialist fields an expression form shows.",
  columns: [
    nameColumn,
    { key: "parent", label: "Parent" },
    { key: "fieldGroup", label: "Field group" },
    { key: "sortOrder", label: "Order", numeric: true, secondary: true },
    { key: "uses", label: "Expressions", numeric: true, secondary: true },
  ],
  fields: [
    { kind: "text", name: "name", label: "Name", required: true, span: "half" },
    slugField,
    {
      kind: "reference",
      name: "parentId",
      label: "Parent category",
      resource: "categories",
      excludeSelfAndDescendants: true,
      help: "Leave empty for a top-level category.",
      span: "half",
    },
    {
      kind: "select",
      name: "fieldGroup",
      label: "Field group",
      required: true,
      options: FIELD_GROUPS.map((g) => ({ value: g, label: g[0]!.toUpperCase() + g.slice(1) })),
      help: "Which specialist fields expressions in this category show.",
      span: "half",
    },
    { kind: "number", name: "sortOrder", label: "Sort order", min: 0, step: 1, span: "half" },
  ],
  list: async () => {
    const rows = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        parentId: categories.parentId,
        parent: categoryParent.name,
        fieldGroup: categories.fieldGroup,
        sortOrder: categories.sortOrder,
        uses: sql<number>`(select count(*)::int from ${expressions} where ${expressions.categoryId} = ${categories.id})`,
      })
      .from(categories)
      .leftJoin(categoryParent, eq(categories.parentId, categoryParent.id))
      .orderBy(asc(categoryParent.name), asc(categories.sortOrder), asc(categories.name));

    return rows.map((r) => ({
      id: r.id,
      cells: { name: r.name, parent: r.parent, fieldGroup: r.fieldGroup, sortOrder: r.sortOrder, uses: r.uses },
      values: {
        name: r.name,
        slug: r.slug,
        parentId: r.parentId,
        fieldGroup: r.fieldGroup,
        sortOrder: r.sortOrder,
      },
      ...(r.uses > 0 ? { deleteBlockedBy: `${r.uses} expression${r.uses === 1 ? " uses" : "s use"} this category` } : {}),
    }));
  },
  optionsFor: async () => ({ parentId: await categoryOptions() }),
  save: async (raw, id) => {
    const parsed = categorySchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error);
    const input = parsed.data;

    if (id !== null && input.parentId !== null) {
      const pairs = await db.select({ id: categories.id, parentId: categories.parentId }).from(categories);
      if (createsCycle(pairs, id, input.parentId)) {
        return { ok: false, error: "A category cannot be its own ancestor.", fieldErrors: { parentId: "Creates a loop." } };
      }
    }

    const slug = await resolveSlug({
      table: categories,
      column: categories.slug,
      idColumn: categories.id,
      requested: input.slug,
      fallbackFrom: input.name,
      ...(id !== null ? { excludeId: id } : {}),
    });

    const values = {
      name: input.name,
      slug,
      parentId: input.parentId,
      fieldGroup: input.fieldGroup,
      sortOrder: input.sortOrder,
    };

    if (id === null) {
      const [row] = await db.insert(categories).values(values).returning({ id: categories.id });
      return { ok: true, id: row!.id };
    }
    await db.update(categories).set(values).where(eq(categories.id, id));
    return { ok: true, id };
  },
  remove: async (id) => {
    await db.delete(categories).where(eq(categories.id, id));
  },
};

async function categoryOptions(): Promise<Option[]> {
  const rows = await db
    .select({ value: categories.id, label: categories.name, parentId: categories.parentId, parent: categoryParent.name })
    .from(categories)
    .leftJoin(categoryParent, eq(categories.parentId, categoryParent.id))
    .orderBy(asc(categoryParent.name), asc(categories.sortOrder), asc(categories.name));
  return rows.map((r) => ({
    value: r.value,
    label: r.label,
    parentId: r.parentId,
    ...(r.parent ? { hint: `in ${r.parent}` } : {}),
  }));
}

// ------------------------------------------------------------
// Companies
// ------------------------------------------------------------

const companyParent = alias(companies, "company_parent");

const companiesConfig: ResourceConfig = {
  key: "companies",
  label: "Companies",
  singular: "Company",
  description:
    "Who owns what. Self-referencing, so ownership chains work: Brown-Forman owns Old Forester. A brand and a distillery can both point at the same company.",
  columns: [
    nameColumn,
    { key: "parent", label: "Owned by" },
    { key: "country", label: "Country", secondary: true },
    { key: "brands", label: "Brands", numeric: true, secondary: true },
    { key: "distilleries", label: "Distilleries", numeric: true, secondary: true },
  ],
  fields: [
    { kind: "text", name: "name", label: "Name", required: true, span: "half" },
    slugField,
    {
      kind: "reference",
      name: "parentId",
      label: "Parent company",
      resource: "companies",
      excludeSelfAndDescendants: true,
      help: "For ownership chains. Leave empty if it owns itself.",
      span: "half",
    },
    { kind: "text", name: "country", label: "Country", placeholder: "USA", span: "half" },
    { kind: "text", name: "website", label: "Website", placeholder: "https://", span: "full" },
    notesField,
  ],
  list: async () => {
    const rows = await db
      .select({
        id: companies.id,
        name: companies.name,
        slug: companies.slug,
        parentId: companies.parentId,
        parent: companyParent.name,
        country: companies.country,
        website: companies.website,
        notes: companies.notes,
        brandCount: sql<number>`(select count(*)::int from ${brands} where ${brands.companyId} = ${companies.id})`,
        distilleryCount: sql<number>`(select count(*)::int from ${distilleries} where ${distilleries.companyId} = ${companies.id})`,
      })
      .from(companies)
      .leftJoin(companyParent, eq(companies.parentId, companyParent.id))
      .orderBy(asc(companies.name));

    return rows.map((r) => ({
      id: r.id,
      cells: {
        name: r.name,
        parent: r.parent,
        country: r.country,
        brands: r.brandCount,
        distilleries: r.distilleryCount,
      },
      values: {
        name: r.name,
        slug: r.slug,
        parentId: r.parentId,
        country: r.country,
        website: r.website,
        notes: r.notes,
      },
    }));
  },
  optionsFor: async () => ({ parentId: await companyOptions() }),
  save: async (raw, id) => {
    const parsed = companySchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error);
    const input = parsed.data;

    if (id !== null && input.parentId !== null) {
      const pairs = await db.select({ id: companies.id, parentId: companies.parentId }).from(companies);
      if (createsCycle(pairs, id, input.parentId)) {
        return { ok: false, error: "A company cannot own itself, directly or through a chain.", fieldErrors: { parentId: "Creates a loop." } };
      }
    }

    const slug = await resolveSlug({
      table: companies,
      column: companies.slug,
      idColumn: companies.id,
      requested: input.slug,
      fallbackFrom: input.name,
      ...(id !== null ? { excludeId: id } : {}),
    });

    const values = {
      name: input.name,
      slug,
      parentId: input.parentId,
      country: input.country,
      website: input.website,
      notes: input.notes,
    };

    if (id === null) {
      const [row] = await db.insert(companies).values(values).returning({ id: companies.id });
      return { ok: true, id: row!.id };
    }
    await db.update(companies).set(values).where(eq(companies.id, id));
    return { ok: true, id };
  },
  remove: async (id) => {
    await db.delete(companies).where(eq(companies.id, id));
  },
};

async function companyOptions(): Promise<Option[]> {
  const rows = await db
    .select({ value: companies.id, label: companies.name, parentId: companies.parentId, hint: companies.country })
    .from(companies)
    .orderBy(asc(companies.name));
  return rows.map((r) => ({
    value: r.value,
    label: r.label,
    parentId: r.parentId,
    ...(r.hint ? { hint: r.hint } : {}),
  }));
}

// ------------------------------------------------------------
// Brands
// ------------------------------------------------------------

const brandsConfig: ResourceConfig = {
  key: "brands",
  label: "Brands",
  singular: "Brand",
  description:
    "The name on the label. Mark a brand as a non-distiller producer when it sources whiskey rather than distilling it — Pursuit Spirits, for instance.",
  columns: [
    nameColumn,
    { key: "company", label: "Company" },
    { key: "isNdp", label: "NDP" },
    { key: "uses", label: "Expressions", numeric: true, secondary: true },
  ],
  fields: [
    { kind: "text", name: "name", label: "Name", required: true, span: "half" },
    slugField,
    { kind: "reference", name: "companyId", label: "Company", resource: "companies", span: "half" },
    {
      kind: "checkbox",
      name: "isNdp",
      label: "Non-distiller producer",
      help: "Sources whiskey rather than distilling it.",
      span: "half",
    },
    notesField,
  ],
  list: async () => {
    const rows = await db
      .select({
        id: brands.id,
        name: brands.name,
        slug: brands.slug,
        companyId: brands.companyId,
        company: companies.name,
        isNdp: brands.isNdp,
        notes: brands.notes,
        uses: sql<number>`(select count(*)::int from ${expressions} where ${expressions.brandId} = ${brands.id})`,
      })
      .from(brands)
      .leftJoin(companies, eq(brands.companyId, companies.id))
      .orderBy(asc(brands.name));

    return rows.map((r) => ({
      id: r.id,
      cells: { name: r.name, company: r.company, isNdp: r.isNdp, uses: r.uses },
      values: { name: r.name, slug: r.slug, companyId: r.companyId, isNdp: r.isNdp, notes: r.notes },
      ...(r.uses > 0 ? { deleteBlockedBy: `${r.uses} expression${r.uses === 1 ? " uses" : "s use"} this brand` } : {}),
    }));
  },
  optionsFor: async () => ({ companyId: await companyOptions() }),
  save: async (raw, id) => {
    const parsed = brandSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error);
    const input = parsed.data;

    const slug = await resolveSlug({
      table: brands,
      column: brands.slug,
      idColumn: brands.id,
      requested: input.slug,
      fallbackFrom: input.name,
      ...(id !== null ? { excludeId: id } : {}),
    });

    const values = { name: input.name, slug, companyId: input.companyId, isNdp: input.isNdp, notes: input.notes };

    if (id === null) {
      const [row] = await db.insert(brands).values(values).returning({ id: brands.id });
      return { ok: true, id: row!.id };
    }
    await db.update(brands).set(values).where(eq(brands.id, id));
    return { ok: true, id };
  },
  remove: async (id) => {
    await db.delete(brands).where(eq(brands.id, id));
  },
};

// ------------------------------------------------------------
// Distilleries
// ------------------------------------------------------------

const distilleriesConfig: ResourceConfig = {
  key: "distilleries",
  label: "Distilleries",
  singular: "Distillery",
  description:
    "Where it was actually made. Expressions link to these many-to-many, so a blend of three distilleries shows up under all three.",
  columns: [
    nameColumn,
    { key: "company", label: "Company", secondary: true },
    { key: "where", label: "Location" },
    { key: "dspNumber", label: "DSP", secondary: true },
    { key: "uses", label: "Expressions", numeric: true, secondary: true },
  ],
  fields: [
    { kind: "text", name: "name", label: "Name", required: true, span: "half" },
    slugField,
    { kind: "reference", name: "companyId", label: "Company", resource: "companies", span: "half" },
    { kind: "text", name: "country", label: "Country", required: true, defaultValue: "USA", span: "half" },
    { kind: "text", name: "city", label: "City", span: "half" },
    { kind: "text", name: "state", label: "State", placeholder: "KY", span: "half" },
    { kind: "text", name: "dspNumber", label: "DSP number", placeholder: "DSP-KY-95", span: "half" },
    { kind: "number", name: "founded", label: "Founded", min: 1600, max: 2200, step: 1, span: "half" },
    notesField,
  ],
  list: async () => {
    const rows = await db
      .select({
        id: distilleries.id,
        name: distilleries.name,
        slug: distilleries.slug,
        companyId: distilleries.companyId,
        company: companies.name,
        city: distilleries.city,
        state: distilleries.state,
        country: distilleries.country,
        dspNumber: distilleries.dspNumber,
        founded: distilleries.founded,
        notes: distilleries.notes,
        uses: sql<number>`(select count(*)::int from ${expressionDistilleries} where ${expressionDistilleries.distilleryId} = ${distilleries.id})`,
      })
      .from(distilleries)
      .leftJoin(companies, eq(distilleries.companyId, companies.id))
      .orderBy(asc(distilleries.name));

    return rows.map((r) => ({
      id: r.id,
      cells: {
        name: r.name,
        company: r.company,
        where: [r.city, r.state, r.country].filter(Boolean).join(", "),
        dspNumber: r.dspNumber,
        uses: r.uses,
      },
      values: {
        name: r.name,
        slug: r.slug,
        companyId: r.companyId,
        city: r.city,
        state: r.state,
        country: r.country,
        dspNumber: r.dspNumber,
        founded: r.founded,
        notes: r.notes,
      },
    }));
  },
  optionsFor: async () => ({ companyId: await companyOptions() }),
  save: async (raw, id) => {
    const parsed = distillerySchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error);
    const input = parsed.data;

    const slug = await resolveSlug({
      table: distilleries,
      column: distilleries.slug,
      idColumn: distilleries.id,
      requested: input.slug,
      fallbackFrom: input.name,
      ...(id !== null ? { excludeId: id } : {}),
    });

    const values = {
      name: input.name,
      slug,
      companyId: input.companyId,
      city: input.city,
      state: input.state,
      country: input.country,
      dspNumber: input.dspNumber,
      founded: input.founded,
      notes: input.notes,
    };

    if (id === null) {
      const [row] = await db.insert(distilleries).values(values).returning({ id: distilleries.id });
      return { ok: true, id: row!.id };
    }
    await db.update(distilleries).set(values).where(eq(distilleries.id, id));
    return { ok: true, id };
  },
  remove: async (id) => {
    await db.delete(distilleries).where(eq(distilleries.id, id));
  },
};

async function distilleryOptions(): Promise<Option[]> {
  const rows = await db
    .select({ value: distilleries.id, label: distilleries.name, state: distilleries.state })
    .from(distilleries)
    .orderBy(asc(distilleries.name));
  return rows.map((r) => ({ value: r.value, label: r.label, ...(r.state ? { hint: r.state } : {}) }));
}

// ------------------------------------------------------------
// Mashbills
// ------------------------------------------------------------

const GRAINS = [
  { name: "corn", label: "Corn" },
  { name: "rye", label: "Rye" },
  { name: "wheat", label: "Wheat" },
  { name: "maltedBarley", label: "Malted barley" },
  { name: "maltedRye", label: "Malted rye" },
  { name: "otherGrain", label: "Other grain" },
] as const;

function describeMashbill(row: {
  corn: string;
  rye: string;
  wheat: string;
  maltedBarley: string;
  maltedRye: string;
  otherGrain: string;
  otherGrainName: string | null;
}): string {
  const parts: string[] = [];
  const push = (value: string, label: string) => {
    const n = Number(value);
    if (n > 0) parts.push(`${Number(n.toFixed(2))}% ${label}`);
  };
  push(row.corn, "corn");
  push(row.rye, "rye");
  push(row.wheat, "wheat");
  push(row.maltedBarley, "malted barley");
  push(row.maltedRye, "malted rye");
  push(row.otherGrain, row.otherGrainName ?? "other");
  return parts.join(" · ");
}

const mashbillsConfig: ResourceConfig = {
  key: "mashbills",
  label: "Mashbills",
  singular: "Mashbill",
  description:
    "Grain recipes, stored once and reused, so you can ask what else uses the same recipe. Percentages have to add up to 100.",
  columns: [
    { key: "name", label: "Name" },
    { key: "recipe", label: "Recipe" },
    { key: "distillery", label: "Distillery", secondary: true },
    { key: "uses", label: "Expressions", numeric: true, secondary: true },
  ],
  fields: [
    { kind: "text", name: "name", label: "Name", placeholder: "BBC High Rye", span: "half" },
    { kind: "reference", name: "distilleryId", label: "Distillery", resource: "distilleries", span: "half" },
    ...GRAINS.map(
      (g): FieldSpec => ({ kind: "number", name: g.name, label: g.label, min: 0, max: 100, step: 0.01, span: "half" }),
    ),
    { kind: "text", name: "otherGrainName", label: "Other grain name", placeholder: "Oats", span: "half" },
    notesField,
  ],
  list: async () => {
    const rows = await db
      .select({
        id: mashbills.id,
        name: mashbills.name,
        corn: mashbills.corn,
        rye: mashbills.rye,
        wheat: mashbills.wheat,
        maltedBarley: mashbills.maltedBarley,
        maltedRye: mashbills.maltedRye,
        otherGrain: mashbills.otherGrain,
        otherGrainName: mashbills.otherGrainName,
        distilleryId: mashbills.distilleryId,
        distillery: distilleries.name,
        notes: mashbills.notes,
        uses: sql<number>`(select count(*)::int from ${expressionMashbills} where ${expressionMashbills.mashbillId} = ${mashbills.id})`,
      })
      .from(mashbills)
      .leftJoin(distilleries, eq(mashbills.distilleryId, distilleries.id))
      .orderBy(asc(mashbills.name), asc(mashbills.id));

    return rows.map((r) => ({
      id: r.id,
      cells: { name: r.name, recipe: describeMashbill(r), distillery: r.distillery, uses: r.uses },
      values: {
        name: r.name,
        corn: r.corn,
        rye: r.rye,
        wheat: r.wheat,
        maltedBarley: r.maltedBarley,
        maltedRye: r.maltedRye,
        otherGrain: r.otherGrain,
        otherGrainName: r.otherGrainName,
        distilleryId: r.distilleryId,
        notes: r.notes,
      },
    }));
  },
  optionsFor: async () => ({ distilleryId: await distilleryOptions() }),
  save: async (raw, id) => {
    const parsed = mashbillSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error);
    const input = parsed.data;

    // Percentages are numeric in Postgres, so they go back as strings.
    const values = {
      name: input.name,
      corn: String(input.corn),
      rye: String(input.rye),
      wheat: String(input.wheat),
      maltedBarley: String(input.maltedBarley),
      maltedRye: String(input.maltedRye),
      otherGrain: String(input.otherGrain),
      otherGrainName: input.otherGrainName,
      distilleryId: input.distilleryId,
      notes: input.notes,
    };

    if (id === null) {
      const [row] = await db.insert(mashbills).values(values).returning({ id: mashbills.id });
      return { ok: true, id: row!.id };
    }
    await db.update(mashbills).set(values).where(eq(mashbills.id, id));
    return { ok: true, id };
  },
  remove: async (id) => {
    await db.delete(mashbills).where(eq(mashbills.id, id));
  },
};

// ------------------------------------------------------------
// Finishes
// ------------------------------------------------------------

const finishesConfig: ResourceConfig = {
  key: "finishes",
  label: "Finishes",
  singular: "Finish",
  description: "Secondary maturation: French oak, PX sherry, maple. Expressions can carry several, in sequence.",
  columns: [
    nameColumn,
    { key: "finishType", label: "Type" },
    { key: "uses", label: "Expressions", numeric: true, secondary: true },
  ],
  fields: [
    { kind: "text", name: "name", label: "Name", required: true, span: "half" },
    slugField,
    {
      kind: "select",
      name: "finishType",
      label: "Type",
      required: true,
      options: FINISH_TYPES.map((t) => ({ value: t, label: t[0]!.toUpperCase() + t.slice(1) })),
      span: "half",
    },
    notesField,
  ],
  list: async () => {
    const rows = await db
      .select({
        id: finishes.id,
        name: finishes.name,
        slug: finishes.slug,
        finishType: finishes.finishType,
        notes: finishes.notes,
        uses: sql<number>`(select count(*)::int from ${expressionFinishes} where ${expressionFinishes.finishId} = ${finishes.id})`,
      })
      .from(finishes)
      .orderBy(asc(finishes.name));

    return rows.map((r) => ({
      id: r.id,
      cells: { name: r.name, finishType: r.finishType, uses: r.uses },
      values: { name: r.name, slug: r.slug, finishType: r.finishType, notes: r.notes },
    }));
  },
  optionsFor: async () => ({}),
  save: async (raw, id) => {
    const parsed = finishSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error);
    const input = parsed.data;

    const slug = await resolveSlug({
      table: finishes,
      column: finishes.slug,
      idColumn: finishes.id,
      requested: input.slug,
      fallbackFrom: input.name,
      ...(id !== null ? { excludeId: id } : {}),
    });

    const values = { name: input.name, slug, finishType: input.finishType, notes: input.notes };

    if (id === null) {
      const [row] = await db.insert(finishes).values(values).returning({ id: finishes.id });
      return { ok: true, id: row!.id };
    }
    await db.update(finishes).set(values).where(eq(finishes.id, id));
    return { ok: true, id };
  },
  remove: async (id) => {
    await db.delete(finishes).where(eq(finishes.id, id));
  },
};

// ------------------------------------------------------------
// Stores
// ------------------------------------------------------------

const storesConfig: ResourceConfig = {
  key: "stores",
  label: "Stores",
  singular: "Store",
  description: "Where you bought it. Name and location together have to be unique, so two branches can share a name.",
  columns: [
    nameColumn,
    { key: "location", label: "Location" },
    { key: "isOnline", label: "Online" },
    { key: "uses", label: "Bottles", numeric: true, secondary: true },
  ],
  fields: [
    { kind: "text", name: "name", label: "Name", required: true, span: "half" },
    slugField,
    { kind: "text", name: "location", label: "Location", placeholder: "Louisville, KY or Online", span: "half" },
    { kind: "checkbox", name: "isOnline", label: "Online retailer", span: "half" },
    { kind: "text", name: "url", label: "Website", placeholder: "https://", span: "full" },
    notesField,
  ],
  list: async () => {
    const rows = await db
      .select({
        id: stores.id,
        name: stores.name,
        slug: stores.slug,
        location: stores.location,
        isOnline: stores.isOnline,
        url: stores.url,
        notes: stores.notes,
        uses: sql<number>`(select count(*)::int from ${bottles} where ${bottles.storeId} = ${stores.id})`,
      })
      .from(stores)
      .orderBy(asc(stores.name));

    return rows.map((r) => ({
      id: r.id,
      cells: { name: r.name, location: r.location, isOnline: r.isOnline, uses: r.uses },
      values: {
        name: r.name,
        slug: r.slug,
        location: r.location,
        isOnline: r.isOnline,
        url: r.url,
        notes: r.notes,
      },
    }));
  },
  optionsFor: async () => ({}),
  save: async (raw, id) => {
    const parsed = storeSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error);
    const input = parsed.data;

    const slug = await resolveSlug({
      table: stores,
      column: stores.slug,
      idColumn: stores.id,
      requested: input.slug,
      fallbackFrom: input.name,
      ...(id !== null ? { excludeId: id } : {}),
    });

    const values = {
      name: input.name,
      slug,
      location: input.location,
      isOnline: input.isOnline,
      url: input.url,
      notes: input.notes,
    };

    if (id === null) {
      const [row] = await db.insert(stores).values(values).returning({ id: stores.id });
      return { ok: true, id: row!.id };
    }
    await db.update(stores).set(values).where(eq(stores.id, id));
    return { ok: true, id };
  },
  remove: async (id) => {
    await db.delete(stores).where(eq(stores.id, id));
  },
};

// ------------------------------------------------------------
// Tags
// ------------------------------------------------------------

const tagsConfig: ResourceConfig = {
  key: "tags",
  label: "Tags",
  singular: "Tag",
  description: "Free-form labels for the field you did not anticipate: Dusty, Gift, Travel Retail, Daily Pour.",
  columns: [nameColumn, { key: "color", label: "Colour" }, { key: "uses", label: "Bottles", numeric: true }],
  fields: [
    { kind: "text", name: "name", label: "Name", required: true, span: "half" },
    slugField,
    { kind: "text", name: "color", label: "Colour", placeholder: "#b5651d", help: "A hex colour, or leave blank.", span: "half" },
  ],
  list: async () => {
    const rows = await db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        color: tags.color,
        uses: sql<number>`(select count(*)::int from ${bottleTags} where ${bottleTags.tagId} = ${tags.id})`,
      })
      .from(tags)
      .orderBy(asc(tags.name));

    return rows.map((r) => ({
      id: r.id,
      cells: { name: r.name, color: r.color, uses: r.uses },
      values: { name: r.name, slug: r.slug, color: r.color },
    }));
  },
  optionsFor: async () => ({}),
  save: async (raw, id) => {
    const parsed = tagSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error);
    const input = parsed.data;

    const slug = await resolveSlug({
      table: tags,
      column: tags.slug,
      idColumn: tags.id,
      requested: input.slug,
      fallbackFrom: input.name,
      ...(id !== null ? { excludeId: id } : {}),
    });

    const values = { name: input.name, slug, color: input.color };

    if (id === null) {
      const [row] = await db.insert(tags).values(values).returning({ id: tags.id });
      return { ok: true, id: row!.id };
    }
    await db.update(tags).set(values).where(eq(tags.id, id));
    return { ok: true, id };
  },
  remove: async (id) => {
    await db.delete(tags).where(eq(tags.id, id));
  },
};

// ------------------------------------------------------------

export const RESOURCES: Record<ResourceKey, ResourceConfig> = {
  categories: categoriesConfig,
  companies: companiesConfig,
  brands: brandsConfig,
  distilleries: distilleriesConfig,
  mashbills: mashbillsConfig,
  finishes: finishesConfig,
  stores: storesConfig,
  tags: tagsConfig,
};

async function brandOptions(): Promise<Option[]> {
  const rows = await db
    .select({ value: brands.id, label: brands.name, hint: companies.name })
    .from(brands)
    .leftJoin(companies, eq(brands.companyId, companies.id))
    .orderBy(asc(brands.name));
  return rows.map((r) => ({ value: r.value, label: r.label, ...(r.hint ? { hint: r.hint } : {}) }));
}

async function finishOptions(): Promise<Option[]> {
  const rows = await db
    .select({ value: finishes.id, label: finishes.name, hint: finishes.finishType })
    .from(finishes)
    .orderBy(asc(finishes.name));
  return rows.map((r) => ({ value: r.value, label: r.label, hint: r.hint }));
}

async function storeOptions(): Promise<Option[]> {
  const rows = await db
    .select({ value: stores.id, label: stores.name, hint: stores.location })
    .from(stores)
    .orderBy(asc(stores.name));
  return rows.map((r) => ({ value: r.value, label: r.label, ...(r.hint ? { hint: r.hint } : {}) }));
}

/** Mashbills often have no name, so the recipe itself is the label. */
async function mashbillOptions(): Promise<Option[]> {
  const rows = await db
    .select({
      value: mashbills.id,
      name: mashbills.name,
      corn: mashbills.corn,
      rye: mashbills.rye,
      wheat: mashbills.wheat,
      maltedBarley: mashbills.maltedBarley,
      maltedRye: mashbills.maltedRye,
      otherGrain: mashbills.otherGrain,
      otherGrainName: mashbills.otherGrainName,
      distillery: distilleries.name,
    })
    .from(mashbills)
    .leftJoin(distilleries, eq(mashbills.distilleryId, distilleries.id))
    .orderBy(asc(mashbills.name), asc(mashbills.id));
  return rows.map((r) => ({
    value: r.value,
    label: r.name ?? describeMashbill(r),
    ...(r.name ? { hint: describeMashbill(r) } : r.distillery ? { hint: r.distillery } : {}),
  }));
}

export const REFERENCE_OPTION_LOADERS = {
  categories: categoryOptions,
  companies: companyOptions,
  brands: brandOptions,
  distilleries: distilleryOptions,
  mashbills: mashbillOptions,
  finishes: finishOptions,
  stores: storeOptions,
} as const;
