/**
 * First-run admin account. Runs on every container start, after migrations,
 * and does nothing once an admin exists.
 *
 * A container on a home server has no terminal to prompt in, so instead of
 * asking, this generates a strong password and prints it once to the
 * container log (Unraid: the container's log icon; elsewhere `docker logs`).
 * The account is flagged so the first sign-in has to replace it, and add a
 * real email if ADMIN_EMAIL wasn't set.
 *
 *   ADMIN_USERNAME  defaults to "admin"
 *   ADMIN_EMAIL     optional; asked for on first sign-in otherwise
 *
 * Run directly with `npm run auth:bootstrap`.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { createPasswordUser, normalizeUsername, usernameProblem } from "../src/lib/auth/accounts";
import { PLACEHOLDER_EMAIL_DOMAIN, generatePassword } from "../src/lib/auth/passwords";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

function banner(lines: string[]): void {
  const rule = "=".repeat(64);
  console.log(`rickhouse: ${rule}`);
  for (const line of lines) console.log(`rickhouse:   ${line}`.trimEnd());
  console.log(`rickhouse: ${rule}`);
}

async function main(): Promise<void> {
  const sql = postgres(url as string, { max: 1, onnotice: () => {} });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  try {
    const [admin] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.role, "admin"))
      .limit(1);

    if (admin) {
      console.log("bootstrap: an admin account exists");
      if (process.env.APP_PASSWORD) {
        console.log("bootstrap: APP_PASSWORD is no longer used and can be removed from your .env");
      }
      return;
    }

    const username = normalizeUsername(process.env.ADMIN_USERNAME || "admin");
    const problem = usernameProblem(username);
    if (problem) throw new Error(`ADMIN_USERNAME "${username}": ${problem}`);

    const [clash] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .limit(1);
    if (clash) {
      banner([
        `No admin account exists, but a member is already called "${username}".`,
        "Promote an account and give it a new password with:",
        `  docker exec <container> node dist/reset-password.mjs ${username} --make-admin`,
      ]);
      return;
    }

    const email = process.env.ADMIN_EMAIL?.trim() || `${username}@${PLACEHOLDER_EMAIL_DOMAIN}`;
    const password = generatePassword();
    await createPasswordUser(db, {
      name: "Admin",
      username,
      email,
      role: "admin",
      password,
      mustChangePassword: true,
    });

    banner([
      "First run: created the admin account.",
      "",
      `  username  ${username}`,
      `  password  ${password}`,
      "",
      "Sign in with these; you'll be asked to choose your own password.",
      "This is the only time the password is shown. If you lose it:",
      `  docker exec <container> node dist/reset-password.mjs ${username}`,
    ]);
  } catch (error: unknown) {
    // RUN_MIGRATIONS=false on a database nobody has migrated yet: say so and
    // let the app start, rather than crash-looping the container.
    if ((error as { code?: string }).code === "42P01") {
      console.warn("bootstrap: the users table does not exist yet; run the migrations, then restart");
      return;
    }
    throw error;
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
