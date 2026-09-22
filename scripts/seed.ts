/**
 * Idempotent seed. Runs on every container start.
 *
 *  - The category tree is always ensured, so a fresh install is navigable.
 *  - The Pursuit Double Oak Spirit example is inserted only while the
 *    collection is empty, so it never reappears after you delete it.
 *
 * Run directly with `npm run db:seed`.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../src/db/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const {
  categories,
  companies,
  brands,
  distilleries,
  mashbillGrains,
  mashbills,
  finishes,
  stores,
  expressions,
  expressionDistilleries,
  expressionMashbills,
  expressionFinishes,
  bottles,
} = schema;

type Db = ReturnType<typeof drizzle<typeof schema>>;

const CATEGORY_TREE = [
  { name: "Whiskey", slug: "whiskey", parent: null, fieldGroup: "whiskey", sortOrder: 1 },
  { name: "Rum", slug: "rum", parent: null, fieldGroup: "rum", sortOrder: 2 },
  { name: "Agave", slug: "agave", parent: null, fieldGroup: "agave", sortOrder: 3 },
  { name: "Brandy", slug: "brandy", parent: null, fieldGroup: "brandy", sortOrder: 4 },

  { name: "American Whiskey", slug: "american-whiskey", parent: "whiskey", fieldGroup: "whiskey", sortOrder: 1 },
  { name: "Scotch", slug: "scotch", parent: "whiskey", fieldGroup: "whiskey", sortOrder: 2 },
  { name: "Irish Whiskey", slug: "irish-whiskey", parent: "whiskey", fieldGroup: "whiskey", sortOrder: 3 },

  { name: "Bourbon", slug: "bourbon", parent: "american-whiskey", fieldGroup: "whiskey", sortOrder: 1 },
  { name: "Rye", slug: "rye", parent: "american-whiskey", fieldGroup: "whiskey", sortOrder: 2 },
  { name: "Wheat Whiskey", slug: "wheat-whiskey", parent: "american-whiskey", fieldGroup: "whiskey", sortOrder: 3 },
  { name: "Single Malt", slug: "american-single-malt", parent: "american-whiskey", fieldGroup: "whiskey", sortOrder: 4 },
  { name: "Light Whiskey", slug: "light-whiskey", parent: "american-whiskey", fieldGroup: "whiskey", sortOrder: 5 },
] as const satisfies ReadonlyArray<{
  name: string;
  slug: string;
  parent: string | null;
  fieldGroup: schema.FieldGroup;
  sortOrder: number;
}>;

async function seedCategories(db: Db): Promise<void> {
  const idBySlug = new Map<string, number>();
  for (const node of CATEGORY_TREE) {
    const parentId = node.parent === null ? null : (idBySlug.get(node.parent) ?? null);
    await db
      .insert(categories)
      .values({
        name: node.name,
        slug: node.slug,
        parentId,
        fieldGroup: node.fieldGroup,
        sortOrder: node.sortOrder,
      })
      .onConflictDoNothing({ target: categories.slug });
    const [row] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, node.slug))
      .limit(1);
    if (!row) throw new Error(`category ${node.slug} missing after insert`);
    idBySlug.set(node.slug, row.id);
  }
}

/** The reference bottle from SPEC.md, end to end, as a smoke test. */
async function seedPursuitExample(db: Db): Promise<void> {
  const [existing] = await db.select({ count: sql<number>`count(*)::int` }).from(bottles);
  if ((existing?.count ?? 0) > 0) {
    console.log("seed: collection is not empty, skipping the example bottle");
    return;
  }

  const [company] = await db
    .insert(companies)
    .values({ name: "Pursuit Spirits", slug: "pursuit-spirits", country: "USA" })
    .onConflictDoNothing({ target: companies.slug })
    .returning({ id: companies.id });
  const companyId =
    company?.id ??
    (await db.select({ id: companies.id }).from(companies).where(eq(companies.slug, "pursuit-spirits")).limit(1))[0]!
      .id;

  const [brand] = await db
    .insert(brands)
    .values({ name: "Pursuit Spirits", slug: "pursuit-spirits-brand", companyId, isNdp: true })
    .onConflictDoNothing({ target: brands.slug })
    .returning({ id: brands.id });
  const brandId =
    brand?.id ??
    (await db.select({ id: brands.id }).from(brands).where(eq(brands.slug, "pursuit-spirits-brand")).limit(1))[0]!.id;

  const distilleryRows = await db
    .insert(distilleries)
    .values([
      { name: "Bardstown Bourbon Company", slug: "bardstown-bourbon-company", state: "KY", country: "USA" },
      { name: "Tennessee Distilling Ltd.", slug: "tennessee-distilling", state: "TN", country: "USA" },
      { name: "Finger Lakes Distilling", slug: "finger-lakes-distilling", state: "NY", country: "USA" },
    ])
    .onConflictDoNothing({ target: distilleries.slug })
    .returning({ id: distilleries.id, slug: distilleries.slug });

  const distilleryId = async (slug: string): Promise<number> =>
    distilleryRows.find((d) => d.slug === slug)?.id ??
    (await db.select({ id: distilleries.id }).from(distilleries).where(eq(distilleries.slug, slug)).limit(1))[0]!.id;

  // Blend of 3: one mashbill per contributing distillery.
  const bbcId = await distilleryId("bardstown-bourbon-company");
  const tdlId = await distilleryId("tennessee-distilling");
  const fldId = await distilleryId("finger-lakes-distilling");

  const mashbillRows = await db
    .insert(mashbills)
    .values([
      { name: "BBC 78/10/12", distilleryId: bbcId },
      { name: "TDL 80/10/10", distilleryId: tdlId },
      { name: "FLD 70/20/10", distilleryId: fldId },
    ])
    .returning({ id: mashbills.id, name: mashbills.name });

  // Grains are rows since M7, so a recipe can carry any grain at all.
  const recipes: Record<string, Array<[string, string]>> = {
    "BBC 78/10/12": [["Corn", "78"], ["Rye", "10"], ["Malted Barley", "12"]],
    "TDL 80/10/10": [["Corn", "80"], ["Rye", "10"], ["Malted Barley", "10"]],
    "FLD 70/20/10": [["Corn", "70"], ["Wheat", "20"], ["Malted Barley", "10"]],
  };
  await db.insert(mashbillGrains).values(
    mashbillRows.flatMap((m) =>
      (recipes[m.name ?? ""] ?? []).map(([grain, percent], position) => ({
        mashbillId: m.id,
        grain,
        percent,
        position,
      })),
    ),
  );

  const [finish] = await db
    .insert(finishes)
    .values({ name: "French Oak", slug: "french-oak", finishType: "wood" })
    .onConflictDoNothing({ target: finishes.slug })
    .returning({ id: finishes.id });
  const finishId =
    finish?.id ??
    (await db.select({ id: finishes.id }).from(finishes).where(eq(finishes.slug, "french-oak")).limit(1))[0]!.id;

  const [store] = await db
    .insert(stores)
    .values({ name: "P.Club by Pursuit Spirits", slug: "p-club", location: "Online", isOnline: true })
    .onConflictDoNothing({ target: stores.slug })
    .returning({ id: stores.id });
  const storeId =
    store?.id ?? (await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, "p-club")).limit(1))[0]!.id;

  const [bourbon] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, "bourbon"))
    .limit(1);
  if (!bourbon) throw new Error("bourbon category missing; seed the taxonomy first");

  const [expression] = await db
    .insert(expressions)
    .values({
      brandId,
      categoryId: bourbon.id,
      name: "Double Oak Spirit",
      slug: "pursuit-double-oak-spirit",
      proof: "108",
      ageStatement: "NAS (labeled Straight, so at least 2 years)",
      msrp: "69.99",
      description: "Blend of three straight bourbons, finished in French oak.",
    })
    .returning({ id: expressions.id });
  if (!expression) throw new Error("failed to insert the example expression");

  await db.insert(expressionDistilleries).values([
    { expressionId: expression.id, distilleryId: bbcId, position: 0 },
    { expressionId: expression.id, distilleryId: tdlId, position: 1 },
    { expressionId: expression.id, distilleryId: fldId, position: 2 },
  ]);

  await db.insert(expressionMashbills).values(
    mashbillRows.map((m, position) => ({ expressionId: expression.id, mashbillId: m.id, position })),
  );

  await db.insert(expressionFinishes).values({ expressionId: expression.id, finishId, position: 0 });

  await db.insert(bottles).values({
    expressionId: expression.id,
    pricePaid: "69.99",
    storeId,
    dateAcquired: "2025-03-27",
    isOpen: false,
    fillPct: 100,
    status: "owned",
  });

  console.log("seed: inserted the Pursuit Double Oak Spirit example");
}

async function main(): Promise<void> {
  const client = postgres(url as string, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema, casing: "snake_case" });
  try {
    await seedCategories(db);
    await seedPursuitExample(db);
    console.log("seed complete");
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
