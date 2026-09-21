/**
 * Applies the Drizzle migrations in ./drizzle, then (optionally) seeds.
 * Run by the container entrypoint on every start; migrations are idempotent.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}

async function main(): Promise<void> {
  const sql = postgres(url as string, { max: 1, onnotice: () => {} });
  try {
    // citext is used by nearly every name column; the migrations assume it.
    await sql.unsafe("CREATE EXTENSION IF NOT EXISTS citext");
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    console.log("migrations applied");
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
