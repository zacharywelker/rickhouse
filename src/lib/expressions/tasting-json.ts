import { provenanceOf, type ProvenanceInput } from "@/lib/provenance";

/** A row of `tastingNotesForLabel`, as far as the API cares. */
export type LabelTastingRow = ProvenanceInput & {
  id: number;
  bottleId: number | null;
  source: string | null;
  tastedAt: string | null;
  tags: string[];
  tastedOn: string;
  rating: string | null;
  nose: string | null;
  palate: string | null;
  finish: string | null;
  overall: string | null;
};

/** One tasting on `GET /api/v1/expressions/:id`. `provenance` is null for a standard bottle or no bottle. */
export function labelTastingJson(row: LabelTastingRow) {
  return {
    id: row.id,
    bottleId: row.bottleId,
    source: row.source,
    tastedAt: row.tastedAt,
    tags: row.tags,
    tastedOn: row.tastedOn,
    rating: row.rating,
    nose: row.nose,
    palate: row.palate,
    finish: row.finish,
    overall: row.overall,
    provenance: provenanceOf(row),
  };
}
