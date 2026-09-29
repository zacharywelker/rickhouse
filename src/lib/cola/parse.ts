import { parse, type HTMLElement } from "node-html-parser";

/**
 * Reads the COLA registry's two public pages (SPEC M11). Pure: HTML in,
 * data out, no network, so every change TTB makes to the markup shows up
 * as a failing fixture test rather than as blank fields in someone's labels.
 *
 * There is no API. These pages are 2000s-era table layouts where a field is
 * a `<strong>Label:</strong>` followed by its value in the same cell. The
 * parser keys on those labels, not on position, and refuses a page where the
 * labels it relies on are missing rather than returning a half-empty record.
 */

export type ColaRecord = {
  ttbId: string;
  status: string | null;
  serialNumber: string | null;
  classType: string | null;
  origin: string | null;
  brandName: string | null;
  fancifulName: string | null;
  applicationType: string | null;
  /** ISO date. */
  approvedOn: string | null;
  permitNumber: string | null;
  applicantName: string | null;
  applicantAddress: string | null;
};

export type ColaLabelImage = {
  /** As written in the page: relative, with raw spaces. Resolve with `registryUrl`. */
  href: string;
  /** TTB's image type: "Brand (front) or keg collar", "Back", "Other"… */
  panel: string | null;
};

export type ColaForm = {
  classTypeCode: string | null;
  originCode: string | null;
  /** From "Source of product": true for Imported, false for Domestic, null if neither is ticked. */
  isImported: boolean | null;
  images: ColaLabelImage[];
};

/** The registry answered, but not with a record: a mistyped or unknown TTB ID. */
export class ColaNotFoundError extends Error {
  constructor(ttbId: string) {
    super(`TTB has no COLA with the ID ${ttbId}.`);
  }
}

/** The page no longer looks the way this parser expects. */
export class ColaParseError extends Error {
  constructor(what: string) {
    super(`The COLA registry page has changed (${what}), so it could not be read.`);
  }
}

/** Collapses whitespace, including the `&nbsp;` the registry pads everything with. */
function clean(text: string): string {
  return text.replace(/[\s ]+/g, " ").trim();
}

function orNull(text: string): string | null {
  const value = clean(text);
  return value === "" ? null : value;
}

/** MM/DD/YYYY to YYYY-MM-DD; null for anything else. */
export function registryDate(text: string | null): string | null {
  const match = text ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text) : null;
  return match ? `${match[3]}-${match[1]}-${match[2]}` : null;
}

function isErrorPage(root: HTMLElement): boolean {
  return /Unable to process request/i.test(root.text);
}

/**
 * Every `<strong>Label:</strong> value` cell, keyed by the label without its
 * colon. The value is the cell's text with the label (and the help icon
 * link next to it, which has no text) taken out.
 */
function labelledCells(root: HTMLElement): Map<string, { cell: HTMLElement; value: string | null }> {
  const cells = new Map<string, { cell: HTMLElement; value: string | null }>();
  for (const strong of root.querySelectorAll("td strong")) {
    const label = clean(strong.text).replace(/\s*:$/, "");
    if (label === "" || cells.has(label)) continue;
    const cell = strong.closest("td");
    if (!cell) continue;
    const value = clean(cell.text).slice(clean(strong.text).length);
    cells.set(label, { cell, value: orNull(value) });
  }
  return cells;
}

const PRINCIPAL_PERMIT = "Plant Registry/Basic Permit/Brewers No (Principal Place of Business)";

/**
 * The permit block is the one field not in its label's cell: the label has a
 * row of its own and the permit, company and address lines follow as one
 * row each, until a blank row.
 */
function permitBlock(root: HTMLElement): string[] {
  const cells = root.querySelectorAll("td");
  const start = cells.findIndex((cell) => clean(cell.querySelector("strong")?.text ?? "").startsWith(PRINCIPAL_PERMIT));
  if (start === -1) return [];
  const lines: string[] = [];
  for (const cell of cells.slice(start + 1)) {
    if (cell.querySelector("strong")) break;
    const text = clean(cell.text);
    if (text === "") {
      if (lines.length > 0) break;
      continue;
    }
    lines.push(text);
  }
  return lines;
}

/** The record page (`action=publicDisplaySearchBasic`). */
export function parseColaDetail(html: string, ttbId: string): ColaRecord {
  const root = parse(html);
  const cells = labelledCells(root);
  const field = (label: string) => cells.get(label)?.value ?? null;

  const shownId = field("TTB ID");
  if (shownId === null) {
    if (isErrorPage(root)) throw new ColaNotFoundError(ttbId);
    throw new ColaParseError("no TTB ID field");
  }
  // The cell also holds the "Printable Version" link; the ID is its first token.
  if (shownId.split(" ")[0] !== ttbId) throw new ColaParseError(`asked for ${ttbId}, got ${shownId}`);
  if (!cells.has("Brand Name") || !cells.has("Class/Type Code")) throw new ColaParseError("no brand or class/type");

  const [permitNumber = null, applicantName = null, ...address] = permitBlock(root);

  return {
    ttbId,
    status: field("Status"),
    serialNumber: field("Serial #"),
    classType: field("Class/Type Code"),
    origin: field("Origin Code"),
    brandName: field("Brand Name"),
    fancifulName: field("Fanciful Name"),
    applicationType: field("Type of Application"),
    approvedOn: registryDate(field("Approval Date")),
    permitNumber,
    applicantName,
    applicantAddress: address.length > 0 ? address.join(", ") : null,
  };
}

/** The value in the `<div class="data">` after a `<div class="label">` reading `label`. */
function boxValue(root: HTMLElement, label: string): string | null {
  for (const div of root.querySelectorAll("div.label")) {
    if (clean(div.text) !== label) continue;
    let next = div.nextElementSibling;
    while (next && !next.classList.contains("data")) next = next.nextElementSibling;
    return next ? orNull(next.text) : null;
  }
  return null;
}

function sourceTicked(root: HTMLElement, which: "Domestic" | "Imported"): boolean {
  const box = root.querySelector(`input[type="checkbox"][alt="Source of Product: ${which}"]`);
  return box?.hasAttribute("checked") ?? false;
}

/** The printable form (`action=publicFormDisplay`). */
export function parseColaForm(html: string, ttbId: string): ColaForm {
  const root = parse(html);
  if (!root.text.includes(ttbId)) {
    if (isErrorPage(root)) throw new ColaNotFoundError(ttbId);
    throw new ColaParseError("the form does not mention its TTB ID");
  }

  const images: ColaLabelImage[] = [];
  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? "";
    // publicViewSignature is the signature block, not a label.
    if (!/publicViewAttachment\.do/i.test(src)) continue;
    const alt = clean(img.getAttribute("alt") ?? "");
    images.push({ href: src, panel: orNull(alt.replace(/^Label Image:\s*/i, "")) });
  }

  const imported = sourceTicked(root, "Imported");
  const domestic = sourceTicked(root, "Domestic");

  return {
    classTypeCode: boxValue(root, "CT"),
    originCode: boxValue(root, "OR"),
    isImported: imported ? true : domestic ? false : null,
    images,
  };
}
