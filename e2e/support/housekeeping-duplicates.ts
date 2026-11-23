import postgres from "postgres";
import { assertThrowawayDatabase } from "./tournament-field";

/** Tables the specs look rows up in by name. */
export type NamedTable = "brands" | "distilleries" | "finishes" | "stores" | "expressions";

const connect = () => {
  assertThrowawayDatabase();
  return postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
};

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/**
 * Gives the admin account pairs that look like the same thing entered twice, with labels and bottles on them. Plain SQL,
 * like the other seeds. Run `resetDatabase()` first; refuses anything but a throwaway database.
 *
 *   distilleries  Quarry Hollow (Frankfort, 2 labels) / Quarry Hollow Distillery (no place, 1 label)   <- merged by default
 *                 Marlow Springs (Bardstown) / Marlow Springs Distillery (no place), 1 label each         <- keep the one without a place
 *   brands        Fenwick Roses / Fenwick Rose                                                              <- dismissed
 *                 Clash Brand / Clash Brands, each with a label called "Shared Name"                    <- cannot merge
 *   finishes      Quince Cask / Quince Casks, with a label that has both and finish-on-mashbill pairings
 *   stores        Halloran's / Hallorans (both Chicago, IL), a bottle each
 */
export async function seedDuplicatesField(): Promise<void> {
  const sql = connect();
  try {
    const [owner] = await sql<{ id: number }[]>`SELECT id FROM users WHERE username = 'admin'`;
    const [category] = await sql<{ id: number }[]>`SELECT id FROM categories WHERE name = 'Bourbon' LIMIT 1`;
    if (!owner || !category) throw new Error("seedDuplicatesField: run db:reset first (no admin or no Bourbon category).");

    const brand = async (name: string) =>
      (await sql<{ id: number }[]>`INSERT INTO brands (name, slug, owner_id) VALUES (${name}, ${slug(`dup-${name}`)}, ${owner.id}) RETURNING id`)[0]!.id;
    const label = async (brandId: number, name: string) =>
      (await sql<{ id: number }[]>`
        INSERT INTO expressions (brand_id, category_id, name, slug, owner_id)
        VALUES (${brandId}, ${category.id}, ${name}, ${slug(`dup-${brandId}-${name}`)}, ${owner.id}) RETURNING id`)[0]!.id;
    const distillery = async (name: string, city: string | null, state: string | null) =>
      (await sql<{ id: number }[]>`
        INSERT INTO distilleries (name, slug, owner_id, city, state)
        VALUES (${name}, ${slug(`dup-${name}`)}, ${owner.id}, ${city}, ${state}) RETURNING id`)[0]!.id;
    const link = (expressionId: number, distilleryId: number) =>
      sql`INSERT INTO expression_distilleries (expression_id, distillery_id) VALUES (${expressionId}, ${distilleryId})`;

    const home = await brand("Dup Home");
    const bt = await distillery("Quarry Hollow", "Frankfort", "KY");
    const btd = await distillery("Quarry Hollow Distillery", null, null);
    await link(await label(home, "Dup QH One"), bt);
    await link(await label(home, "Dup QH Two"), bt);
    await link(await label(home, "Dup QH Three"), btd);
    const hh = await distillery("Marlow Springs", "Bardstown", "KY");
    const hhd = await distillery("Marlow Springs Distillery", null, null);
    await link(await label(home, "Dup MS One"), hh);
    await link(await label(home, "Dup MS Two"), hhd);

    await brand("Fenwick Roses");
    await brand("Fenwick Rose");
    const alpha = await brand("Clash Brand");
    const beta = await brand("Clash Brands");
    await label(alpha, "Shared Name");
    await label(beta, "Shared Name");

    // A label with both finishes, a pairing on each, and a label with only the removed one.
    const wood = async (name: string, type: string) =>
      (await sql<{ id: number }[]>`INSERT INTO finishes (name, slug, owner_id, finish_type) VALUES (${name}, ${slug(`dup-${name}`)}, ${owner.id}, ${type}) RETURNING id`)[0]!.id;
    const port = await wood("Quince Cask", "wine");
    const ports = await wood("Quince Casks", "other");
    const both = await label(home, "Dup Finish Both");
    const only = await label(home, "Dup Finish Only");
    const [mash] = await sql<{ id: number }[]>`INSERT INTO mashbills (owner_id) VALUES (${owner.id}) RETURNING id`;
    for (const id of [both, only]) await sql`INSERT INTO expression_mashbills (expression_id, mashbill_id) VALUES (${id}, ${mash!.id})`;
    for (const [expressionId, finishId] of [[both, port], [both, ports], [only, ports]] as const) {
      await sql`INSERT INTO expression_finishes (expression_id, finish_id) VALUES (${expressionId}, ${finishId})`;
      await sql`INSERT INTO expression_finish_mashbills (expression_id, mashbill_id, finish_id) VALUES (${expressionId}, ${mash!.id}, ${finishId})`;
    }

    const store = async (name: string) =>
      (await sql<{ id: number }[]>`INSERT INTO stores (name, slug, owner_id, city, state) VALUES (${name}, ${slug(`dup-${name}`)}, ${owner.id}, 'Chicago', 'IL') RETURNING id`)[0]!.id;
    const binnys = await store("Halloran's");
    const binnys2 = await store("Hallorans");
    const storeLabel = await label(home, "Dup Store Label");
    for (const id of [binnys, binnys2]) await sql`INSERT INTO bottles (expression_id, owner_id, store_id) VALUES (${storeLabel}, ${owner.id}, ${id})`;
  } finally {
    await sql.end();
  }
}

/** The id of the admin's row of this name, or null once it is gone. */
export async function rowId(table: NamedTable, name: string): Promise<number | null> {
  const sql = connect();
  try {
    const rows = await sql<{ id: number }[]>`SELECT id FROM ${sql(table)} WHERE name = ${name} AND owner_id = (SELECT id FROM users WHERE username = 'admin')`;
    return rows[0]?.id ?? null;
  } finally {
    await sql.end();
  }
}

/** The name of the distillery a label is linked to, one string per link. */
export async function labelDistilleries(labelName: string): Promise<string[]> {
  const sql = connect();
  try {
    const rows = await sql<{ name: string }[]>`
      SELECT d.name FROM expression_distilleries ed
      JOIN distilleries d ON d.id = ed.distillery_id
      JOIN expressions e ON e.id = ed.expression_id
      WHERE e.name = ${labelName} ORDER BY d.name`;
    return rows.map((row) => row.name);
  } finally {
    await sql.end();
  }
}

export async function distilleryOtherNames(name: string): Promise<string[]> {
  const sql = connect();
  try {
    const rows = await sql<{ name: string }[]>`
      SELECT n.name FROM distillery_names n JOIN distilleries d ON d.id = n.distillery_id WHERE d.name = ${name} ORDER BY n.name`;
    return rows.map((row) => row.name);
  } finally {
    await sql.end();
  }
}

export async function distilleryCity(name: string): Promise<string | null> {
  const sql = connect();
  try {
    const rows = await sql<{ city: string | null }[]>`SELECT city FROM distilleries WHERE name = ${name}`;
    return rows[0]?.city ?? null;
  } finally {
    await sql.end();
  }
}

/** A label's finishes and the finishes on its mashbill pairings, by name. */
export async function labelFinishes(labelName: string): Promise<{ finishes: string[]; pairings: string[] }> {
  const sql = connect();
  try {
    const finishes = await sql<{ name: string }[]>`
      SELECT f.name FROM expression_finishes ef JOIN finishes f ON f.id = ef.finish_id JOIN expressions e ON e.id = ef.expression_id
      WHERE e.name = ${labelName} ORDER BY f.name`;
    const pairings = await sql<{ name: string }[]>`
      SELECT f.name FROM expression_finish_mashbills p JOIN finishes f ON f.id = p.finish_id JOIN expressions e ON e.id = p.expression_id
      WHERE e.name = ${labelName} ORDER BY f.name`;
    return { finishes: finishes.map((row) => row.name), pairings: pairings.map((row) => row.name) };
  } finally {
    await sql.end();
  }
}

/** The merge log, newest first. */
export async function mergeLog(): Promise<Array<{ kind: string; survivor_name: string; removed_name: string; moved: Array<{ label: string; count: number }>; adopted: string[] }>> {
  const sql = connect();
  try {
    return await sql`SELECT kind, survivor_name, removed_name, moved, adopted FROM housekeeping_merges ORDER BY id DESC`;
  } finally {
    await sql.end();
  }
}
