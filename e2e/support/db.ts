import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { assertThrowawayDatabase } from "../../src/lib/throwaway-database";

const run = promisify(execFile);

/**
 * Restores the seeded baseline.
 *
 * Specs create real rows — bottles, expressions, killed bottles — and those
 * outlive the file that made them. Without this, a spec passes alone and fails
 * in the suite depending on what ran before it, which is the worst kind of
 * test: one that is only sometimes telling the truth.
 *
 * Called from `beforeAll` in each spec file, so files are isolated from each
 * other while tests within a file can still build on one another.
 */
export async function resetDatabase(): Promise<void> {
  // This empties every table, so it will only run against a database that is plainly a throwaway one. There is no
  // fallback URL: the one this used to fall back to was the real database's name.
  assertThrowawayDatabase();
  await run("npm", ["run", "db:reset"], { cwd: process.cwd(), env: process.env });
}
