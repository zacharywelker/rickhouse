import { sql, type SQL } from "drizzle-orm";
import type { db } from "@/db";
import { buildEntrant, type EntryFacts, type MashbillRow } from "./entrants";
import type { Entrant } from "./types";
import { categoryKinds } from "@/lib/expressions/rules";
import { whiskeyAge } from "@/lib/expressions/whiskey-age";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** An entry as far as loading its facts needs. */
export type EntryRef = { id: number; displayName: string; bottleId: number | null; expressionId: number | null };

const list = (ids: number[]): SQL => sql.join(ids.map((id) => sql`${id}`), sql`, `);

type ValueRow = {
  id: number;
  proof: string | null;
  age_years: string | null;
  age_months: number | null;
  age_days: number | null;
  age_statement?: string | null;
  field_group?: string | null;
  category_name?: string | null;
  category_id?: number;
  is_straight?: boolean;
  is_nas?: boolean;
  is_bottled_in_bond?: boolean;
  amaro_style?: string | null;
  is_aged?: boolean;
  is_aged_gin?: boolean;
};

/**
 * What the grouping needs to know about each entry, by entry id: a bottle's proof and age (its own over its release's
 * over its label's, as the bottle list resolves them), a label-only entry's from the label, and for both the
 * label's distilleries, finishes (in their listed order) and mashbills. An ad hoc entry has none, so it sorts last.
 * Only the owner's own bottles and labels are read.
 */
export async function loadEntrants(tx: Tx, ownerId: number, entries: EntryRef[]): Promise<Map<number, Entrant>> {
  const run = async <T>(query: SQL): Promise<T[]> => (await tx.execute(query)) as unknown as T[];
  const bottleIds = [...new Set(entries.flatMap((e) => (e.bottleId !== null ? [e.bottleId] : [])))];
  const expressionIds = [...new Set(entries.flatMap((e) => (e.expressionId !== null ? [e.expressionId] : [])))];

  const bottleRows = bottleIds.length
    ? await run<ValueRow>(sql`SELECT id, proof, age_years, age_months, age_days, age_statement FROM bottle_list WHERE owner_id = ${ownerId} AND id IN (${list(bottleIds)})`)
    : [];
  const labelRows = expressionIds.length
    ? await run<ValueRow>(sql`SELECT e.id, e.proof, e.age_years, e.age_months, e.age_days, e.age_statement,
        e.category_id, e.is_straight, e.is_nas, e.is_bottled_in_bond, e.amaro_style, e.is_aged, e.is_aged_gin, c.field_group, c.name AS category_name
        FROM expressions e JOIN categories c ON c.id = e.category_id
        WHERE e.owner_id = ${ownerId} AND e.id IN (${list(expressionIds)})`)
    : [];
  const categoryRows = await run<{ id: number; slug: string; parentId: number | null }>(sql`SELECT id, slug, parent_id AS "parentId" FROM categories`);
  const kinds = categoryKinds(categoryRows);
  const categorySlugs = new Map(categoryRows.map((row) => [row.id, row.slug]));
  const ingredientRows = expressionIds.length
    ? await run<{ expression_id: number; name: string; kind: string }>(sql`SELECT ei.expression_id, i.name::text AS name, i.kind FROM expression_ingredients ei
        JOIN ingredients i ON i.id = ei.ingredient_id WHERE ei.expression_id IN (${list(expressionIds)}) AND i.kind IN ('flavor', 'vodka_base')
        ORDER BY ei.expression_id, ei.position`)
    : [];
  const distilleryRows = expressionIds.length
    ? await run<{ expression_id: number; name: string }>(sql`SELECT ed.expression_id, d.name FROM expression_distilleries ed
        JOIN distilleries d ON d.id = ed.distillery_id WHERE ed.expression_id IN (${list(expressionIds)})
        ORDER BY ed.expression_id, ed."position", d.id`)
    : [];
  const finishRows = expressionIds.length
    ? await run<{ expression_id: number; name: string }>(sql`SELECT ef.expression_id, f.name FROM expression_finishes ef
        JOIN finishes f ON f.id = ef.finish_id WHERE ef.expression_id IN (${list(expressionIds)})
        ORDER BY ef.expression_id, ef."position", f.id`)
    : [];
  const mashbillRows = expressionIds.length
    ? await run<{ expression_id: number; mashbill_id: number; name: string | null; style: string | null; is_generic: boolean; is_secret: boolean; is_partial: boolean }>(
        sql`SELECT em.expression_id, m.id AS mashbill_id, m.name, m.style, m.is_generic, m.is_secret, m.is_partial FROM expression_mashbills em
          JOIN mashbills m ON m.id = em.mashbill_id WHERE em.expression_id IN (${list(expressionIds)})
          ORDER BY em.expression_id, em."position", m.id`,
      )
    : [];
  const mashbillIds = [...new Set(mashbillRows.map((m) => m.mashbill_id))];
  const grainRows = mashbillIds.length
    ? await run<{ mashbill_id: number; grain: string; percent: string }>(sql`SELECT mashbill_id, grain, percent FROM mashbill_grains
        WHERE mashbill_id IN (${list(mashbillIds)}) ORDER BY mashbill_id, "position", id`)
    : [];

  const bottleById = new Map(bottleRows.map((r) => [r.id, r]));
  const labelById = new Map(labelRows.map((r) => [r.id, r]));
  const grouped = <T extends { expression_id: number }>(rows: T[]) => {
    const out = new Map<number, T[]>();
    for (const row of rows) out.set(row.expression_id, [...(out.get(row.expression_id) ?? []), row]);
    return out;
  };
  const distilleries = grouped(distilleryRows);
  const ingredients = grouped(ingredientRows);
  const finishes = grouped(finishRows);
  const mashbills = grouped(mashbillRows);
  const grainsOf = new Map<number, { grain: string; percent: string }[]>();
  for (const g of grainRows) grainsOf.set(g.mashbill_id, [...(grainsOf.get(g.mashbill_id) ?? []), { grain: g.grain, percent: g.percent }]);

  const result = new Map<number, Entrant>();
  for (const entry of entries) {
    const label = entry.expressionId !== null ? labelById.get(entry.expressionId) : undefined;
    const bottle = entry.bottleId !== null ? bottleById.get(entry.bottleId) : undefined;
    const values = bottle ?? label;
    const resolvedAge = label?.field_group === "whiskey" && values ? whiskeyAge({
      ageYears: values.age_years,
      ageMonths: values.age_months,
      ageDays: values.age_days,
      ageStatement: values.age_statement ?? null,
      isStraight: label.is_straight,
      isNas: label.is_nas,
      isBottledInBond: label.is_bottled_in_bond,
    }, kinds[label.category_id ?? -1] ?? "other") : null;
    const hideAge = label?.field_group === "vodka" || (label?.field_group === "gin" && !label.is_aged_gin) || ((label?.field_group === "amaro" || label?.field_group === "liqueur") && !label.is_aged);
    const exprId = entry.expressionId;
    const facts: EntryFacts = {
      proof: values?.proof ?? null,
      ageYears: hideAge ? null : resolvedAge?.groupingYears !== undefined && resolvedAge.groupingYears !== null ? String(resolvedAge.groupingYears) : values?.age_years ?? null,
      ageMonths: hideAge || (resolvedAge?.groupingYears !== null && resolvedAge?.groupingYears !== undefined) ? null : values?.age_months ?? null,
      ageDays: hideAge || (resolvedAge?.groupingYears !== null && resolvedAge?.groupingYears !== undefined) ? null : values?.age_days ?? null,
      ...(resolvedAge ? { ageDisplay: resolvedAge.text, ageInferred: resolvedAge.inferred } : {}),
      spiritFact: label?.field_group === "amaro" ? label.amaro_style ?? null :
        label?.field_group === "liqueur" || label?.field_group === "vodka"
          ? (ingredients.get(exprId ?? -1) ?? []).filter((row) => row.kind === (label?.field_group === "vodka" && kinds[label?.category_id ?? -1] !== "flavored-vodka" ? "vodka_base" : "flavor")).map((row) => row.name).join(", ") || null : null,
      fieldGroup: label?.field_group ?? null,
      category: label?.category_name ?? null,
      distilleries: exprId !== null ? (distilleries.get(exprId) ?? []).map((d) => d.name) : [],
      finishes: exprId !== null && (!(["amaro", "liqueur"].includes(label?.field_group ?? "")) || label?.is_aged) ? (finishes.get(exprId) ?? []).map((f) => f.name) : [],
      caskTypeMode: ["canadian", "irish", "scotch", "amaro", "liqueur", "chocolate-liqueur", "cream-liqueur"].includes(kinds[label?.category_id ?? -1] ?? ""),
      mashbills:
        exprId !== null
          ? (mashbills.get(exprId) ?? []).map(
              (m): MashbillRow => ({ name: m.name, style: m.style, isGeneric: m.is_generic, isSecret: m.is_secret, isPartial: m.is_partial, grains: grainsOf.get(m.mashbill_id) ?? [] }),
            ).concat((mashbills.get(exprId) ?? []).length === 0 && ["single-malt-scotch", "malt-irish-whiskey"].includes(categorySlugs.get(label?.category_id ?? -1) ?? "")
              ? [{ name: null, isGeneric: false, isSecret: false, grains: [{ grain: "Malted Barley", percent: "100" }] }] : [])
          : [],
    };
    result.set(entry.id, buildEntrant(entry.id, entry.displayName, facts));
  }
  return result;
}
