import type { ActionResult } from "./admin/types";

/**
 * Postgres tells us precisely what went wrong; the UI should say it in words.
 * Anything unrecognised is logged and reported generically rather than leaking
 * a driver message into the page.
 */
type PgError = {
  code?: string;
  constraint_name?: string;
  detail?: string;
  table_name?: string;
  column_name?: string;
};

/**
 * Drizzle wraps driver errors in its own Error and hangs the original off
 * `cause`, so the Postgres code is never on the object that was thrown.
 * Walk the chain to find it.
 */
function asPgError(error: unknown): PgError | null {
  let cursor: unknown = error;
  for (let depth = 0; depth < 5 && typeof cursor === "object" && cursor !== null; depth += 1) {
    const candidate = cursor as PgError & { cause?: unknown };
    if (typeof candidate.code === "string") return candidate;
    cursor = candidate.cause;
  }
  return null;
}

/** "Key (name)=(Bourbon) already exists." -> "name" */
function columnFromDetail(detail: string | undefined): string | null {
  const match = detail?.match(/^Key \(([^)]+)\)=/);
  if (!match?.[1]) return null;
  // Composite keys come back as "name, location"; the first is the useful one.
  return match[1].split(",")[0]?.trim() ?? null;
}

export function mapDbError(error: unknown, context: { singular: string }): ActionResult {
  const pg = asPgError(error);

  switch (pg?.code) {
    case "23505": {
      // unique_violation
      const column = columnFromDetail(pg.detail);
      const label = column === "slug" ? "URL slug" : (column ?? "value");
      return {
        ok: false,
        error: `Another ${context.singular.toLowerCase()} already uses that ${label}.`,
        ...(column && column !== "slug" ? { fieldErrors: { [column]: "Already taken." } } : {}),
      };
    }
    case "23503":
      // foreign_key_violation. On delete this means something still points here.
      return {
        ok: false,
        error: `Something still references this ${context.singular.toLowerCase()}, so it cannot be deleted. Remove those links first.`,
      };
    case "23514":
      // check_violation
      return pg.constraint_name === "mashbill_sums_to_100"
        ? { ok: false, error: "The grain percentages have to add up to 100." }
        : { ok: false, error: "That combination of values is not allowed." };
    case "23502":
      return {
        ok: false,
        error: `${pg.column_name ?? "A required field"} cannot be empty.`,
        ...(pg.column_name ? { fieldErrors: { [pg.column_name]: "Required." } } : {}),
      };
    default:
      console.error("[rickhouse] unhandled database error", error);
      return { ok: false, error: "Something went wrong saving that. Check the logs for details." };
  }
}
