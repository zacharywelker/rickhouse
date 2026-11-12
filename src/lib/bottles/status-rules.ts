import { isEffectivelyOpen, type OpenedState } from "./opened-rules";

/**
 * Setting a bottle's status directly, as the bulk editor does. No database here, so the rules can be tested alone.
 *
 * The phone and the Opened tick never type a status: it follows the level and the Opened date. A sheet cell is a typed
 * status, so each status is held to what it means, and a choice the bottle's state contradicts is refused with the
 * reason, never quietly changed to something else:
 *
 * - Killed is empty and done: level zero, open, dated today (as the Kill button does).
 * - Open is opened: the open flag, and a date stamped today if it has none.
 * - Owned is sealed. A bottle that has been opened (or is under full) says so rather than being silently resealed.
 * - Sold, traded and sampled leave the level alone; wishlist is a bottle you do not have, so it cannot be an opened one.
 * - Leaving killed drops the killed date; an empty bottle cannot become open or owned (nothing is in it).
 */
export type StatusState = OpenedState;
export type StatusChanges = Partial<{ status: string; fillPct: number; isOpen: boolean; dateOpened: string | null; dateKilled: string | null }>;
export type StatusResult = { ok: true; set: StatusChanges } | { ok: false; message: string };

const fail = (message: string): StatusResult => ({ ok: false, message });

export function statusUpdate(current: StatusState, target: string, today: string): StatusResult {
  if (target === current.status) return { ok: true, set: {} };
  const leavingKilled = current.status === "killed" ? { dateKilled: null } : {};

  switch (target) {
    case "killed":
      return { ok: true, set: { status: "killed", fillPct: 0, isOpen: true, dateKilled: current.dateKilled ?? today } };
    case "open":
      if (current.fillPct === 0) return fail("An empty bottle cannot be open. Set the level above empty first.");
      return { ok: true, set: { status: "open", isOpen: true, ...(current.dateOpened === null ? { dateOpened: today } : {}), ...leavingKilled } };
    case "owned":
      if (current.fillPct === 0) return fail("An empty bottle cannot be owned and sealed. Set the level to full first.");
      if (current.fillPct < 100 || current.isOpen || isEffectivelyOpen(current)) return fail("This bottle has been opened. Mark it open, or set the level to full and clear Opened to seal it.");
      return { ok: true, set: { status: "owned", ...leavingKilled } };
    case "wishlist":
      if (isEffectivelyOpen(current) || current.dateOpened !== null) return fail("A bottle you have opened cannot go on the wishlist.");
      return { ok: true, set: { status: "wishlist", ...leavingKilled } };
    case "sold":
    case "traded":
    case "sampled":
      return { ok: true, set: { status: target, ...leavingKilled } };
    default:
      return fail("Choose one of the statuses.");
  }
}

/**
 * Ticking Opened on a sealed bottle opens it (a date is stamped, owned becomes open), as the bottle page does.
 * Unticking seals it, and sealed means full, so a bottle under full is asked, not reset: the caller gets the reason.
 */
export function openFlagUpdate(current: StatusState, wantOpen: boolean, today: string): StatusResult {
  if (wantOpen) {
    if (isEffectivelyOpen(current) && current.isOpen && current.dateOpened !== null) return { ok: true, set: {} };
    return { ok: true, set: { isOpen: true, ...(current.dateOpened === null ? { dateOpened: today } : {}), ...(current.status === "owned" ? { status: "open" } : {}) } };
  }
  if (!isEffectivelyOpen(current) && !current.isOpen) return { ok: true, set: current.dateOpened === null ? {} : { dateOpened: null } };
  if (current.fillPct < 100) return fail("Sealed means full. Set the level to full first, then clear Opened.");
  if (["killed", "sold", "traded", "sampled"].includes(current.status)) return fail("A bottle that is finished, sold or traded cannot be marked sealed.");
  return { ok: true, set: { isOpen: false, dateOpened: null, ...(current.status === "open" ? { status: "owned" } : {}) } };
}
