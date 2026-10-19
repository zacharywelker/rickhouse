/**
 * What tells one bottle of a label from another, as a tasting inherits it: a single barrel, a private selection
 * (a store or group's own pick), a barrel number, a release or batch. Every field can be null, because a pour of a
 * bottle the owner does not have joins to no bottle at all.
 */
export type ProvenanceInput = {
  isSingleBarrel: boolean | null;
  isSingleBarrelPick: boolean | null;
  pickName: string | null;
  pickedBy: string | null;
  barrelNumber: string | null;
  releaseName: string | null;
  bottleBatch: string | null;
  releaseYear: number | null;
};

/** The shape the API sends for a tasting's bottle. `null` means a standard bottle, or no bottle. */
export type Provenance = {
  singleBarrel: boolean;
  privateSelection: boolean;
  pickName: string | null;
  pickedBy: string | null;
  barrelNumber: string | null;
  release: string | null;
  batch: string | null;
  releaseYear: number | null;
};

const blank = (value: string | null): string | null => (value && value.trim() !== "" ? value.trim() : null);

export function provenanceOf(input: ProvenanceInput): Provenance | null {
  const provenance: Provenance = {
    singleBarrel: input.isSingleBarrel === true,
    privateSelection: input.isSingleBarrelPick === true || blank(input.pickedBy) !== null,
    pickName: blank(input.pickName),
    pickedBy: blank(input.pickedBy),
    barrelNumber: blank(input.barrelNumber),
    release: blank(input.releaseName),
    batch: blank(input.bottleBatch),
    releaseYear: input.releaseYear,
  };
  const standard =
    !provenance.singleBarrel &&
    !provenance.privateSelection &&
    provenance.pickName === null &&
    provenance.barrelNumber === null &&
    provenance.release === null &&
    provenance.batch === null &&
    provenance.releaseYear === null;
  return standard ? null : provenance;
}

/** The short phrases that mark a tasting's bottle, most telling first. Empty for a standard bottle. */
export function provenanceTags(provenance: Provenance | null): string[] {
  if (!provenance) return [];
  const tags: string[] = [];
  if (provenance.privateSelection) tags.push("Private selection");
  if (provenance.pickName) tags.push(`“${provenance.pickName}”`);
  if (provenance.pickedBy) tags.push(`Picked by ${provenance.pickedBy}`);
  if (provenance.singleBarrel) tags.push("Single barrel");
  if (provenance.barrelNumber) tags.push(`Barrel ${provenance.barrelNumber}`);
  if (provenance.release) tags.push(provenance.release);
  else if (provenance.batch) tags.push(`Batch ${provenance.batch}`);
  const year = provenance.releaseYear;
  if (year !== null) {
    // The year counts as already shown only as a whole number: "Batch 20240" does not carry 2024.
    const shown = Number.isInteger(year) && provenance.release !== null && new RegExp(`(?<!\\d)${year}(?!\\d)`).test(provenance.release);
    if (!shown) tags.push(String(year));
  }
  return tags;
}
