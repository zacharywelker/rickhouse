import postgres from "postgres";

/** Eight labels with a bottle each, at proofs 90 to 125. Their names are unlikely to occur anywhere else on a page. */
export const FIELD_WORDS = ["Quillon", "Brevard", "Tamsin", "Corbett", "Marlow", "Ostrava", "Penhall", "Ravenel"] as const;
export const FIELD_BRAND = "Tz";
export const FIELD_COUNT = FIELD_WORDS.length;
export const FIELD_NAMES = new RegExp(FIELD_WORDS.join("|"));

const PROOFS = [90, 92, 100, 101, 112, 115, 120, 125];

/**
 * Throws unless DATABASE_URL names a throwaway database on this machine (localhost, no `host=` override): one whose name has a segment test, tourney, scratch or proto
 * (`rickhouse_tourney_web`, `rickhouse_tourney_proto` pass; `rickhouse` and `contest` do not). Call it before anything
 * that resets or seeds, since `resetDatabase()` wipes whatever the URL points at.
 */
export function assertThrowawayDatabase(url: string | undefined = process.env.DATABASE_URL): void {
  let name = "";
  let local = false;
  try {
    const parsed = new URL(url ?? "");
    name = decodeURIComponent(parsed.pathname.slice(1));
    local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) && !parsed.searchParams.has("host");
  } catch {
    name = "";
  }
  if (!local || !/(^|_)(test|tourney|scratch|proto)(_|$)/.test(name)) {
    throw new Error("DATABASE_URL must be a local throwaway database (a name with a test, tourney, scratch or proto segment).");
  }
}

/**
 * Gives the admin account the field the tournament specs play with. `db:reset` leaves one bottle, and the specs need
 * eight with a proof. Rows go in with plain SQL: the point is the tournament screens, not the bottle form.
 * Run `resetDatabase()` first; refuses anything but a throwaway database.
 */
export async function seedTournamentField(): Promise<void> {
  assertThrowawayDatabase();
  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const [owner] = await sql<{ id: number }[]>`SELECT id FROM users WHERE username = 'admin'`;
    const [category] = await sql<{ id: number }[]>`SELECT id FROM categories WHERE name = 'Bourbon' LIMIT 1`;
    if (!owner || !category) throw new Error("seedTournamentField: run db:reset first (no admin or no Bourbon category).");
    const [brand] = await sql<{ id: number }[]>`INSERT INTO brands (name, slug, owner_id) VALUES (${FIELD_BRAND}, 'tz-e2e', ${owner.id}) RETURNING id`;
    for (const [i, word] of FIELD_WORDS.entries()) {
      const [label] = await sql<{ id: number }[]>`
        INSERT INTO expressions (brand_id, category_id, name, slug, owner_id, proof)
        VALUES (${brand!.id}, ${category.id}, ${word}, ${`tz-e2e-${i}`}, ${owner.id}, ${PROOFS[i]!})
        RETURNING id`;
      await sql`INSERT INTO bottles (expression_id, owner_id) VALUES (${label!.id}, ${owner.id})`;
    }
  } finally {
    await sql.end();
  }
}

/** Thirteen more bottles under their own brand, with the facts the flight names and the draft columns read. Search "Rh" to pick just these. */
export const RICH_BRAND = "Rh";
export const RICH_COUNT = 13;
export const RICH_NAMES = {
  highRye: ["Aldous", "Bexley", "Carrow", "Dunmore"],
  wheated: ["Eastlea", "Fenwick", "Garrick", "Holloway"],
  rye: ["Ivesham", "Jarrow", "Kestrel", "Lenham"],
  malt: "Moorgate",
} as const;
/** Their two distilleries, alternated so no flight shares one (a shared distillery would prefix the flight's title). */
export const RICH_DISTILLERIES = ["Ardmore Works", "Brightwater Works"] as const;
export const RICH_FINISH = "Port Pipe";

/**
 * Seeds the "Rh" field. At flights of 4 (proof order) it makes three titled flights and a lone bottle:
 * High rye bourbons (90-93 proof), Wheated bourbons (100-103), Wine-finished ryes (110-113) and a single malt (120).
 * At flights of 6 it makes 6, 6 and a lone bottle. Run after `seedTournamentField()`; refuses anything but a throwaway database.
 */
export async function seedRichField(): Promise<void> {
  assertThrowawayDatabase();
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    const [owner] = await sql<{ id: number }[]>`SELECT id FROM users WHERE username = 'admin'`;
    const category = async (name: string) => (await sql<{ id: number }[]>`SELECT id FROM categories WHERE name = ${name} LIMIT 1`)[0]?.id;
    const [bourbon, rye, malt] = [await category("Bourbon"), await category("Rye"), await category("Single Malt Scotch")];
    if (!owner || !bourbon || !rye || !malt) throw new Error("seedRichField: run db:reset first (no admin or no Bourbon, Rye or Single Malt Scotch category).");
    const [brand] = await sql<{ id: number }[]>`INSERT INTO brands (name, slug, owner_id) VALUES (${RICH_BRAND}, 'rh-e2e', ${owner.id}) RETURNING id`;
    const distilleries: number[] = [];
    for (const [i, name] of RICH_DISTILLERIES.entries()) {
      const [d] = await sql<{ id: number }[]>`INSERT INTO distilleries (name, slug, owner_id) VALUES (${name}, ${`rh-e2e-d${i}`}, ${owner.id}) RETURNING id`;
      distilleries.push(d!.id);
    }
    const [port] = await sql<{ id: number }[]>`INSERT INTO finishes (name, slug, owner_id) VALUES (${RICH_FINISH}, 'rh-e2e-port', ${owner.id}) RETURNING id`;
    const recipe = async (grains: [string, number][]) => {
      const [m] = await sql<{ id: number }[]>`INSERT INTO mashbills (owner_id) VALUES (${owner.id}) RETURNING id`;
      // One statement: the 100% check runs at commit, so the grains must arrive together.
      await sql`INSERT INTO mashbill_grains ${sql(grains.map(([grain, percent], position) => ({ mashbill_id: m!.id, grain, percent, position })))}`;
      return m!.id;
    };
    const highRye = await recipe([["Corn", 60], ["Rye", 28], ["Malted Barley", 12]]);
    const wheated = await recipe([["Corn", 70], ["Wheat", 18], ["Malted Barley", 12]]);
    const ryeBill = await recipe([["Rye", 95], ["Malted Barley", 5]]);

    let n = 0;
    const label = async (word: string, categoryId: number, proof: number, age: number, mashbillId: number | null, finish: boolean) => {
      const i = n++;
      const [e] = await sql<{ id: number }[]>`
        INSERT INTO expressions (brand_id, category_id, name, slug, owner_id, proof, age_years)
        VALUES (${brand!.id}, ${categoryId}, ${word}, ${`rh-e2e-${i}`}, ${owner.id}, ${proof}, ${age}) RETURNING id`;
      await sql`INSERT INTO bottles (expression_id, owner_id) VALUES (${e!.id}, ${owner.id})`;
      await sql`INSERT INTO expression_distilleries (expression_id, distillery_id) VALUES (${e!.id}, ${distilleries[i % 2]!})`;
      if (mashbillId !== null) await sql`INSERT INTO expression_mashbills (expression_id, mashbill_id) VALUES (${e!.id}, ${mashbillId})`;
      if (finish) await sql`INSERT INTO expression_finishes (expression_id, finish_id) VALUES (${e!.id}, ${port!.id})`;
    };
    for (const [i, w] of RICH_NAMES.highRye.entries()) await label(w, bourbon, 90 + i, 4 + i, highRye, false);
    for (const [i, w] of RICH_NAMES.wheated.entries()) await label(w, bourbon, 100 + i, 6 + i, wheated, false);
    for (const [i, w] of RICH_NAMES.rye.entries()) await label(w, rye, 110 + i, 3 + i, ryeBill, true);
    await label(RICH_NAMES.malt, malt, 120, 12, null, false);
  } finally {
    await sql.end();
  }
}
