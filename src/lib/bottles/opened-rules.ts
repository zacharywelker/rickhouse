/**
 * What clearing or setting a bottle's Opened date changes besides the date (spec 2026-10-08-edit-facts-design.md,
 * section 3). No database here, so the rules can be tested alone.
 *
 * A bottle's open state is `is_open`, `date_opened`, `status` and the level. Status is never typed: it follows
 * these, as the fill control and the Opened tick already make it.
 */
export type OpenedState = { isOpen: boolean; dateOpened: string | null; dateKilled: string | null; status: string; fillPct: number };
export type OpenedChoice = "keep_open" | "seal";
export type OpenedChanges = Partial<{ dateOpened: string | null; isOpen: boolean; status: string; fillPct: number }>;
export type OpenedResult =
  | { ok: true; set: OpenedChanges }
  | { ok: false; code: "opened_cleared" | "invalid"; message: string };

/** A YYYY-MM-DD that exists: Date.parse alone lets 2026-02-31 through as March 3. */
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** Statuses of a bottle that is gone from the shelf; there is nothing to seal. */
const FINISHED = new Set(["killed", "sold", "traded", "sampled"]);

function isEffectivelyOpen(current: OpenedState): boolean {
  return current.isOpen || (!FINISHED.has(current.status) && (current.status === "open" || current.fillPct < 100));
}

/**
 * Unticking Opened seals the bottle, and sealed means full. A full bottle loses nothing by it; one under full
 * would lose its level, so that one asks first.
 */
export function untickOpened(fillPct: number): "seal" | "ask" {
  return fillPct >= 100 ? "seal" : "ask";
}

export function openedUpdate(current: OpenedState, dateOpened: string | null, choice: OpenedChoice | undefined, today: string): OpenedResult {
  if (dateOpened !== null) {
    if (!isRealDate(dateOpened)) {
      return { ok: false, code: "invalid", message: "That is not a real date." };
    }
    if (dateOpened > today) return { ok: false, code: "invalid", message: "That date is in the future." };
    if (current.dateKilled && current.dateKilled < dateOpened) {
      return { ok: false, code: "invalid", message: "Killed before it was opened — check these dates." };
    }
    // Setting a date opens the bottle, as ticking Opened does.
    return {
      ok: true,
      set: { dateOpened, isOpen: true, ...(current.status === "owned" ? { status: "open" } : {}) },
    };
  }

  // Cleared, and the bottle was never open: only a stale date to drop. "Open" is the same test the grid and the
  // dial use, not just the flag: a bottle under full, or with status open, reads as open even where `is_open` is off.
  if (!isEffectivelyOpen(current)) return { ok: true, set: current.dateOpened === null ? {} : { dateOpened: null } };

  if (choice === undefined) {
    return { ok: false, code: "opened_cleared", message: "This bottle is open. Keep it open, or mark it sealed?" };
  }
  if (choice === "keep_open") return { ok: true, set: { dateOpened: null } };

  if (FINISHED.has(current.status)) {
    return { ok: false, code: "invalid", message: "A bottle that is finished, sold or traded can't be marked sealed." };
  }
  // Sealed means full: the level goes back to 100 whatever it was.
  return {
    ok: true,
    set: { dateOpened: null, isOpen: false, fillPct: 100, ...(current.status === "open" ? { status: "owned" } : {}) },
  };
}

/**
 * A bottle being created. Below full means it has been poured from, the same rule as the dial, so it is open
 * whatever the tick says; open stops it being merely owned and stamps a date unless one was given.
 */
export function settleNewBottleOpen<T extends { isOpen: boolean; fillPct: number; status: string; dateOpened?: string | null }>(
  values: T,
  today: string,
): T {
  const isOpen = values.isOpen || values.status === "open" || values.fillPct < 100;
  if (!isOpen) return values;
  return {
    ...values,
    isOpen: true,
    status: values.status === "owned" ? "open" : values.status,
    dateOpened: values.dateOpened ?? today,
  };
}
