/**
 * TTB IDs and the public registry's addresses (SPEC M11).
 *
 * A TTB ID is 14 digits: a two-digit year, the day of the year, a filing
 * channel and a sequence number — 21132001000620 was filed on day 132 of
 * 2021. The registry prints them bare, but people paste them with spaces or
 * dashes, or paste the whole registry URL.
 */

/** Always www: the bare host is the same site, but it is one more host to allow through a firewall. */
export const REGISTRY_ORIGIN = "https://www.ttbonline.gov";
export const REGISTRY_HOSTS: ReadonlySet<string> = new Set(["www.ttbonline.gov", "ttbonline.gov"]);

const BASE = `${REGISTRY_ORIGIN}/colasonline`;

/**
 * The 14-digit TTB ID in `input`, or null. Accepts the bare number (with any
 * spaces or dashes), or any registry URL carrying `ttbid=`.
 */
export function normalizeTtbId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const fromUrl = /[?&]ttbid=([0-9]{14})(?:[&#]|$)/i.exec(trimmed);
  if (fromUrl) return fromUrl[1]!;
  const digits = trimmed.replace(/[\s-]/g, "");
  return /^[0-9]{14}$/.test(digits) ? digits : null;
}

/** The registry's record page — the one to link people to. */
export function colaDetailUrl(ttbId: string): string {
  return `${BASE}/viewColaDetails.do?action=publicDisplaySearchBasic&ttbid=${ttbId}`;
}

/** The printable Form 5100.31: the class/type and origin codes, and the label images. */
export function colaFormUrl(ttbId: string): string {
  return `${BASE}/viewColaDetails.do?action=publicFormDisplay&ttbid=${ttbId}`;
}

/** The Basic Search page, which also opens the session results are paged in. */
export function colaSearchFormUrl(): string {
  return `${BASE}/publicSearchColasBasic.do`;
}

export function colaSearchUrl(): string {
  return `${BASE}/publicSearchColasBasicProcess.do?action=search`;
}

/**
 * Resolves a link scraped from a registry page, refusing anything that would
 * leave the registry. Returns null for a link that points elsewhere, so a
 * changed or tampered page can never steer a fetch to another host.
 */
export function registryUrl(href: string): URL | null {
  let url: URL;
  try {
    // Attachment links contain raw spaces ("op 6yo brand label NEW.jpg"); URL encodes them.
    url = new URL(href, `${BASE}/`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !REGISTRY_HOSTS.has(url.hostname) || url.port !== "") return null;
  if (url.username || url.password) return null;
  return url;
}

/** At most this many approvals are picked while creating a label; each is fetched on save. */
export const MAX_PENDING_COLAS = 10;

/**
 * The TTB IDs a new label's form carries in `ttbIds` (a JSON array):
 * normalized, deduplicated, in order, capped. Anything unreadable is dropped.
 */
export function pendingTtbIds(raw: unknown): string[] {
  let parsed: unknown;
  try {
    parsed = typeof raw === "string" && raw !== "" ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const ids: string[] = [];
  for (const entry of parsed) {
    const id = typeof entry === "string" ? normalizeTtbId(entry) : null;
    if (id && !ids.includes(id)) ids.push(id);
    if (ids.length === MAX_PENDING_COLAS) break;
  }
  return ids;
}

/** A permit number with the punctuation, case and leading zeros that hand-typed ones vary in removed. */
export function permitKey(permit: string): string {
  return permit
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/(?<=[A-Z])0+(?=\d)/g, "");
}

/** A class/type the registry can search on by code: digits with an optional letter, like "101" or "101A". */
export function isClassTypeCode(input: string): boolean {
  return /^[0-9]{1,4}[A-Za-z]?$/.test(input.trim());
}
