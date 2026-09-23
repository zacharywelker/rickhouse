/** Result of validating and saving one row of a bulk grid. */
export type BulkRowResult =
  | { index: number; ok: true; id: number }
  | { index: number; ok: false; error: string; fieldErrors: Record<string, string> };

export type BulkSaveResult = {
  savedCount: number;
  results: BulkRowResult[];
};
