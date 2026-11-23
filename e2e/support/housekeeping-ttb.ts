import postgres from "postgres";
import { assertThrowawayDatabase } from "./tournament-field";

/** Eighteen labels with no TTB approval and two with one. */
export const TTB_UNAPPROVED = 18;
export const TTB_APPROVED = 2;

const connect = () => {
  assertThrowawayDatabase();
  return postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
};
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Gives the admin account labels the TTB approvals section lists (18 with no approval, a bottle on some) and two it
 * does not (they have one). Plain SQL, like the other seeds. Run `resetDatabase()` first; refuses anything but a
 * throwaway database.
 */
export async function seedTtbField(): Promise<void> {
  const sql = connect();
  try {
    const [owner] = await sql<{ id: number }[]>`SELECT id FROM users WHERE username = 'admin'`;
    const [category] = await sql<{ id: number }[]>`SELECT id FROM categories WHERE name = 'Bourbon' LIMIT 1`;
    if (!owner || !category) throw new Error("seedTtbField: run db:reset first (no admin or no Bourbon category).");
    const [brand] = await sql<{ id: number }[]>`INSERT INTO brands (name, slug, owner_id) VALUES ('Ttb Home', 'ttb-home-e2e', ${owner.id}) RETURNING id`;
    const label = async (name: string) =>
      (await sql<{ id: number }[]>`
        INSERT INTO expressions (brand_id, category_id, name, slug, owner_id)
        VALUES (${brand!.id}, ${category.id}, ${name}, ${`ttb-e2e-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}, ${owner.id}) RETURNING id`)[0]!.id;
    for (let i = 1; i <= TTB_UNAPPROVED; i++) {
      const id = await label(`Ttb Lab ${pad(i)}`);
      if (i % 3 === 0) await sql`INSERT INTO bottles (expression_id, owner_id) VALUES (${id}, ${owner.id})`;
    }
    for (let i = 1; i <= TTB_APPROVED; i++) {
      const id = await label(`Ttb Approved ${i}`);
      await sql`INSERT INTO expression_colas (owner_id, expression_id, ttb_id) VALUES (${owner.id}, ${id}, ${`2113200100062${i}`})`;
    }
  } finally {
    await sql.end();
  }
}

/** The admin's labels the section would list right now (no approval, not marked Not on TTB). */
export async function listedCount(): Promise<number> {
  const sql = connect();
  try {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM expressions e
      WHERE e.owner_id = (SELECT id FROM users WHERE username = 'admin')
        AND NOT EXISTS (SELECT 1 FROM expression_colas c WHERE c.expression_id = e.id)
        AND NOT EXISTS (SELECT 1 FROM housekeeping_dismissals d WHERE d.owner_id = e.owner_id AND d.scope = 'ttb' AND d.key = e.id::text)`;
    return row!.n;
  } finally {
    await sql.end();
  }
}

/** How many approvals a label has attached. */
export async function approvalCount(labelName: string): Promise<number> {
  const sql = connect();
  try {
    const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM expression_colas c JOIN expressions e ON e.id = c.expression_id WHERE e.name = ${labelName}`;
    return row!.n;
  } finally {
    await sql.end();
  }
}

/** Whether the admin marked a label "Not on TTB". */
export async function isMarkedNotOnTtb(labelName: string): Promise<boolean> {
  const sql = connect();
  try {
    const rows = await sql`
      SELECT 1 FROM housekeeping_dismissals d JOIN expressions e ON e.id::text = d.key AND e.owner_id = d.owner_id
      WHERE d.scope = 'ttb' AND e.name = ${labelName}`;
    return rows.length > 0;
  } finally {
    await sql.end();
  }
}
