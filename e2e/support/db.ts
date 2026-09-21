import { execFile } from "node:child_process";
import { promisify } from "node:util";

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
  await run("npm", ["run", "db:reset"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgres://rickhouse:rickhouse@127.0.0.1:5432/rickhouse",
    },
  });
}
