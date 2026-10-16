import { expect } from "vitest";
import type { TournamentSettings } from "../lifecycle";
import type { TournamentView } from "../view";

/**
 * Shared set-up for the integration tests, which run the tournament server layer against a real Postgres. They are
 * skipped unless TOURNAMENT_TEST_DATABASE_URL names a throwaway database that has the migrations applied (never the
 * real one). Each file makes its own users and data and removes them afterwards.
 *
 *   TOURNAMENT_TEST_DATABASE_URL=postgres://user:pass@localhost:5432/scratch npx vitest run integration
 */
export const url = process.env.TOURNAMENT_TEST_DATABASE_URL;

export type Db = {
  sql: <T = Record<string, unknown>>(query: string, ...params: unknown[]) => Promise<T[]>;
  life: typeof import("../lifecycle");
  heats: typeof import("../heats");
  ranking: typeof import("../ranking-query");
  queries: typeof import("../queries");
  end: () => Promise<void>;
};

/** Connects, with the app's own database module pointed at the test database before it is first imported. */
export async function connect(): Promise<Db> {
  process.env.DATABASE_URL = url!;
  process.env.SESSION_SECRET ??= "x".repeat(40);
  const postgres = (await import("postgres")).default;
  const client = postgres(url!, { max: 2, onnotice: () => {} });
  return {
    sql: async (query, ...params) => (await client.unsafe(query, params as never[])) as never,
    life: await import("../lifecycle"),
    heats: await import("../heats"),
    ranking: await import("../ranking-query"),
    queries: await import("../queries"),
    end: () => client.end(),
  };
}

export const settings = (over: Partial<TournamentSettings> = {}): TournamentSettings => ({
  name: "Test",
  heatSize: 4,
  seeding: "similar",
  groupOrder: ["proof", "mashbill", "distillery", "age", "finish"],
  blind: false,
  fieldNote: null,
  ...over,
});

export type Cat = { whiskey: number; rum: number };

export function fixtures(m: Db) {
  const users: number[] = [];
  let seq = 0;
  // Test files run in parallel, so the id carries the process and a random part as well as a counter.
  const uid = () => `${process.pid.toString(36)}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  async function mkUser(): Promise<number> {
    const id = uid();
    const [row] = await m.sql<{ id: number }>(`INSERT INTO users (name, email, username) VALUES ($1, $2, $3) RETURNING id`, `T ${id}`, `${id}@example.test`, `u${id}`);
    users.push(row!.id);
    return row!.id;
  }

  async function mkCategories(): Promise<Cat> {
    const one = async (name: string, group: string) =>
      (await m.sql<{ id: number }>(`INSERT INTO categories (name, slug, field_group) VALUES ($1, $2, $3) RETURNING id`, `${name} ${uid()}`, `c-${uid()}`, group))[0]!.id;
    return { whiskey: await one("Test Bourbon", "whiskey"), rum: await one("Test Rum", "rum") };
  }

  /** A label with its brand, and optionally a generic mashbill style (every account starts with them) and a distillery. */
  async function mkLabel(owner: number, cat: number, name: string, opts: { proof?: number; style?: string; distillery?: string; ageYears?: number } = {}): Promise<number> {
    const [brand] = await m.sql<{ id: number }>(`INSERT INTO brands (name, slug, owner_id) VALUES ($1, $2, $3) RETURNING id`, `B ${name}`, `b-${uid()}`, owner);
    const [label] = await m.sql<{ id: number }>(
      `INSERT INTO expressions (brand_id, category_id, name, slug, owner_id, proof, age_years) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      brand!.id, cat, name, `e-${uid()}`, owner, opts.proof ?? null, opts.ageYears ?? null,
    );
    if (opts.style) {
      const [mash] = await m.sql<{ id: number }>(`SELECT id FROM mashbills WHERE owner_id = $1 AND name = $2 AND is_generic`, owner, opts.style);
      await m.sql(`INSERT INTO expression_mashbills (expression_id, mashbill_id) VALUES ($1, $2)`, label!.id, mash!.id);
    }
    if (opts.distillery) {
      const [d] = await m.sql<{ id: number }>(`INSERT INTO distilleries (name, slug, owner_id) VALUES ($1, $2, $3) RETURNING id`, `${opts.distillery} ${uid()}`, `d-${uid()}`, owner);
      await m.sql(`INSERT INTO expression_distilleries (expression_id, distillery_id) VALUES ($1, $2)`, label!.id, d!.id);
    }
    return label!.id;
  }

  async function mkBottle(owner: number, label: number, opts: { proof?: number; pickName?: string } = {}): Promise<number> {
    const [b] = await m.sql<{ id: number }>(`INSERT INTO bottles (expression_id, owner_id, proof, pick_name) VALUES ($1, $2, $3, $4) RETURNING id`, label, owner, opts.proof ?? null, opts.pickName ?? null);
    return b!.id;
  }

  /** Six bottles, each of a label of its own, at proofs 90 to 125. */
  async function mkField(owner: number, cat: number, prefix: string): Promise<{ bottles: number[]; labels: number[] }> {
    const field = { bottles: [] as number[], labels: [] as number[] };
    for (const [i, proof] of [90, 92, 100, 101, 115, 125].entries()) {
      const label = await mkLabel(owner, cat, `${prefix} ${i}`, { proof, style: i % 2 === 0 ? "Low Rye" : "High Rye", distillery: i < 3 ? "Alpha" : "Beta" });
      field.labels.push(label);
      field.bottles.push(await mkBottle(owner, label));
    }
    return field;
  }

  /** A new user with a six-bottle field, so a ranking is not changed by what other tests did. */
  async function mkOwnerWithField(cat: number): Promise<{ user: number; bottles: number[]; labels: number[] }> {
    const user = await mkUser();
    return { user, ...(await mkField(user, cat, "Own")) };
  }

  /** Plays the tournament to its end, ranking each pending flight in the order its entries are listed. */
  async function finish(user: number, id: number): Promise<void> {
    for (let guard = 0; guard < 2000; guard++) {
      const view = (await m.queries.getTournament(user, id)) as TournamentView;
      if (view.status === "complete") return;
      const open = view.rounds[view.rounds.length - 1]!.heats.find((h) => h.status === "pending")!;
      expect((await m.heats.recordHeat(user, id, open.id, { ranking: open.entries.map((e) => e.entryId) }, user)).ok).toBe(true);
    }
    throw new Error("the tournament did not finish");
  }

  async function cleanup(): Promise<void> {
    for (const id of users) await m.sql(`DELETE FROM users WHERE id = $1`, id);
  }

  return { mkUser, mkCategories, mkLabel, mkBottle, mkField, mkOwnerWithField, finish, cleanup };
}

export type Fixtures = ReturnType<typeof fixtures>;
