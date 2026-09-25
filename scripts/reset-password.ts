/**
 * Command-line password reset: the way back in when nobody can sign in, and
 * the fallback while no email (SMTP) is configured.
 *
 *   docker exec <container> node dist/reset-password.mjs <username-or-email> [--make-admin]
 *   npm run auth:reset-password -- <username-or-email> [--make-admin]
 *
 * Prints a new generated password, signs the account out everywhere, and
 * makes the next sign-in choose a new one. --make-admin also promotes the
 * account, for the day the only admin is the one locked out.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { findUserByLogin, replacePassword } from "../src/lib/auth/accounts";
import { generatePassword } from "../src/lib/auth/passwords";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const args = process.argv.slice(2);
const makeAdmin = args.includes("--make-admin");
const login = args.find((arg) => !arg.startsWith("--"));

if (!login) {
  console.error("usage: reset-password <username-or-email> [--make-admin]");
  process.exit(2);
}

async function main(): Promise<number> {
  const sql = postgres(url as string, { max: 1, onnotice: () => {} });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  try {
    const user = await findUserByLogin(db, login as string);
    if (!user) {
      console.error(`No account has the username or email "${login}".`);
      return 1;
    }

    const password = generatePassword();
    await replacePassword(db, user.id, password, { mustChangePassword: true });
    if (makeAdmin && user.role !== "admin") {
      await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.id, user.id));
    }

    console.log(`Password reset for ${user.username} (${user.email}).`);
    if (makeAdmin) console.log("The account is now an admin.");
    console.log("");
    console.log(`  new password  ${password}`);
    console.log("");
    console.log("Every existing session was signed out. Signing in with this password");
    console.log("asks for a new one straight away.");
    if (user.banned) {
      console.log("");
      console.log("Note: this account is deactivated. Reactivate it from Configuration → Users.");
    }
    return 0;
  } finally {
    await sql.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
