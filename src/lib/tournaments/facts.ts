import { sql, type SQL } from "drizzle-orm";
import type { db } from "@/db";
import { buildEntrant, type EntryFacts, type MashbillRow } from "./entrants";
import type { Entrant } from "./types";

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
  field_group?: string | null;
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
    ? await run<ValueRow>(sql`SELECT id, proof, age_years, age_months, age_days FROM bottle_list WHERE owner_id = ${ownerId} AND id IN (${list(bottleIds)})`)
    : [];
  const labelRows = expressionIds.length
    ? await run<ValueRow>(sql`SELECT e.id, e.proof, e.age_years, e.age_months, e.age_days, c.field_group
        FROM expressions e JOIN categories c ON c.id = e.category_id
        WHERE e.owner_id = ${ownerId} AND e.id IN (${list(expressionIds)})`)
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
    ? await run<{ expression_id: number; mashbill_id: number; name: string | null; is_generic: boolean; is_secret: boolean }>(
        sql`SELECT em.expression_id, m.id AS mashbill_id, m.name, m.is_generic, m.is_secret FROM expression_mashbills em
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
  const finishes = grouped(finishRows);
  const mashbills = grouped(mashbillRows);
  const grainsOf = new Map<number, { grain: string; percent: string }[]>();
  for (const g of grainRows) grainsOf.set(g.mashbill_id, [...(grainsOf.get(g.mashbill_id) ?? []), { grain: g.grain, percent: g.percent }]);

  const result = new Map<number, Entrant>();
  for (const entry of entries) {
    const label = entry.expressionId !== null ? labelById.get(entry.expressionId) : undefined;
    const bottle = entry.bottleId !== null ? bottleById.get(entry.bottleId) : undefined;
    const values = bottle ?? label;
    const exprId = entry.expressionId;
    const facts: EntryFacts = {
      proof: values?.proof ?? null,
      ageYears: values?.age_years ?? null,
      ageMonths: values?.age_months ?? null,
      ageDays: values?.age_days ?? null,
      fieldGroup: label?.field_group ?? null,
      distilleries: exprId !== null ? (distilleries.get(exprId) ?? []).map((d) => d.name) : [],
      finishes: exprId !== null ? (finishes.get(exprId) ?? []).map((f) => f.name) : [],
      mashbills:
        exprId !== null
          ? (mashbills.get(exprId) ?? []).map(
              (m): MashbillRow => ({ name: m.name, isGeneric: m.is_generic, isSecret: m.is_secret, grains: grainsOf.get(m.mashbill_id) ?? [] }),
            )
          : [],
    };
    result.set(entry.id, buildEntrant(entry.id, entry.displayName, facts));
  }
  return result;
}
