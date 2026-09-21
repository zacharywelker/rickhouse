/**
 * Shared parent-chain logic for the self-referencing taxonomies (categories
 * and companies). Pure and free of `server-only` so both the server action and
 * the form component can use it — and so it can be tested directly.
 */

export type ParentLink = { id: number; parentId?: number | null };

/**
 * Would pointing `id` at `parentId` close a loop?
 *
 * Walks up from the proposed parent looking for `id`. A pre-existing loop
 * elsewhere in the data stops the walk rather than hanging; repairing that is
 * not this function's job.
 */
export function createsCycle(
  links: ReadonlyArray<ParentLink>,
  id: number,
  parentId: number | null,
): boolean {
  if (parentId === null) return false;
  if (parentId === id) return true;

  const parentOf = new Map(links.map((link) => [link.id, link.parentId ?? null]));
  const seen = new Set<number>();
  let cursor: number | null = parentId;

  while (cursor !== null) {
    if (cursor === id) return true;
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }
  return false;
}

/**
 * `id` plus everything beneath it. The parent picker hides these, because
 * choosing one is exactly the move that would orphan a subtree.
 */
export function descendantsOf(links: ReadonlyArray<ParentLink>, id: number): Set<number> {
  const excluded = new Set<number>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const link of links) {
      const parent = link.parentId ?? null;
      if (parent !== null && excluded.has(parent) && !excluded.has(link.id)) {
        excluded.add(link.id);
        grew = true;
      }
    }
  }
  return excluded;
}
