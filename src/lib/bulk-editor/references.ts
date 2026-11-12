import type { Pick } from "./drafts";
import type { RefNames } from "./sheet";
import type { Candidate } from "./suggest";

/**
 * The cells that pick one thing from a list of others: a bottle's store, release and label name (version), and a label's
 * cooperage. The list is the account's (stores, cooperages) or the label's own (releases, older names). A store or a
 * cooperage can be made on the spot, by choosing the visible *Create "…"* with Enter, like a brand; a release and a
 * label name belong to a label and are only picked.
 *
 * An edited cell holds its choice as text: `id:12` for one that exists, `new:Name` for one to be made, and nothing to clear.
 */

export type RefKind = "store" | "cooperage" | "release" | "version";

export type RefData = {
  stores: Array<{ id: number; name: string; hint?: string }>;
  cooperages: Array<{ id: number; name: string }>;
  /** By label id. */
  releases: Record<number, Array<{ id: number; name: string }>>;
  versions: Record<number, Array<{ id: number; name: string }>>;
};

export const REF_CAN_CREATE: Readonly<Record<RefKind, boolean>> = { store: true, cooperage: true, release: false, version: false };

/** What the cell is called in the messages. */
export const REF_WHAT: Readonly<Record<RefKind, string>> = { store: "store", cooperage: "cooperage", release: "release", version: "label name" };

/** Why Create is not offered, for the two that cannot be made here. */
export const REF_NO_CREATE: Readonly<Partial<Record<RefKind, string>>> = {
  release: "Releases are added on the label's page.",
  version: "A label's older names are added on the label's page.",
};

export const refNames = (data: RefData): RefNames => ({
  store: Object.fromEntries(data.stores.map((s) => [s.id, s.name])),
  cooperage: Object.fromEntries(data.cooperages.map((c) => [c.id, c.name])),
  release: Object.fromEntries(Object.values(data.releases).flat().map((r) => [r.id, r.name])),
  version: Object.fromEntries(Object.values(data.versions).flat().map((r) => [r.id, r.name])),
});

/** What the cell offers: the account's stores or cooperages, or this label's releases or names. */
export function refCandidates(kind: RefKind, labelId: number, data: RefData): Candidate[] {
  switch (kind) {
    case "store":
      return data.stores.map((s) => ({ id: s.id, name: s.name, ...(s.hint ? { hint: s.hint } : {}) }));
    case "cooperage":
      return data.cooperages.map((c) => ({ id: c.id, name: c.name }));
    case "release":
      return (data.releases[labelId] ?? []).map((r) => ({ id: r.id, name: r.name }));
    case "version":
      return (data.versions[labelId] ?? []).map((r) => ({ id: r.id, name: r.name }));
  }
}

export const encodeRef = (id: number | null | undefined): string => (id == null ? "" : `id:${id}`);
export const encodePick = (pick: Pick): string => (pick.kind === "existing" ? `id:${pick.id}` : `new:${pick.name}`);

export function decodeRef(value: string): { id: number } | { name: string } | null {
  if (value.startsWith("id:")) {
    const id = Number(value.slice(3));
    return Number.isInteger(id) && id > 0 ? { id } : null;
  }
  return value.startsWith("new:") && value.length > 4 ? { name: value.slice(4) } : null;
}

/**
 * What a cell's text is, to the server: the id of one that exists, the name of one to make (under the form's name for
 * it, `storeName` or `cooperageName`), or null to clear.
 */
export function refServerFields(field: string, value: string): Record<string, unknown> {
  const ref = decodeRef(value);
  if (ref === null) return { [field]: null };
  return "id" in ref ? { [field]: ref.id } : { [field.replace(/Id$/, "Name")]: ref.name };
}
