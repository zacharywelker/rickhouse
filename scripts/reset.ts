/**
 * Empties every table and re-seeds — a known starting point for the
 * end-to-end suite, which creates real rows as it goes. Recreates two
 * accounts, `admin` and `member`, both with E2E_PASSWORD (default
 * "smoke-test-password") and no pending password change.
 *
 *   npm run db:reset
 *
 * Refuses to run against a database that does not look like a development
 * one, because this deletes a collection.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { createPasswordUser } from "../src/lib/auth/accounts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const SAFE_HOSTS = ["localhost", "127.0.0.1", "db"];

function assertSafe(target: string): void {
  if (process.env.ALLOW_DESTRUCTIVE_RESET === "true") return;
  const host = new URL(target).hostname;
  if (!SAFE_HOSTS.includes(host)) {
    throw new Error(
      `Refusing to wipe the database at ${host}. Set ALLOW_DESTRUCTIVE_RESET=true if you really mean it.`,
    );
  }
}

// Order matters only for readability; TRUNCATE ... CASCADE handles the rest.
const TABLES = [
  "bottle_tags",
  "pours",
  "tasting_notes",
  "bottle_images",
  "bottles",
  "expression_finishes",
  "expression_mashbills",
  "expression_distilleries",
  "expressions",
  "mashbills",
  "brands",
  "distilleries",
  "stores",
  "finishes",
  "tags",
  "companies",
  "categories",
  "smtp_settings",
  "sso_providers",
  "passkeys",
  "two_factors",
  "verifications",
  "sessions",
  "accounts",
  "users",
];

const PASSWORD = process.env.E2E_PASSWORD ?? "smoke-test-password";

async function main(): Promise<void> {
  assertSafe(url as string);
  const client = postgres(url as string, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema, casing: "snake_case" });
  try {
    await db.execute(sql.raw(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`));
    console.log(`reset: emptied ${TABLES.length} tables`);
    for (const [username, role] of [
      ["admin", "admin"],
      ["member", "member"],
    ] as const) {
      await createPasswordUser(db, {
        name: username === "admin" ? "Admin" : "Member",
        username,
        email: `${username}@example.com`,
        role,
        password: PASSWORD,
        mustChangePassword: false,
      });
    }
    console.log("reset: created the admin and member accounts");
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
