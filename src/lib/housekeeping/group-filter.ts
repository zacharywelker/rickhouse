/**
 * A smart group keeps the Collection's filters as a query string ("pick=1&store=3"), with ids in comma lists. When a
 * merge removes a row, a group that filtered on it must follow the survivor or it would quietly match nothing.
 * Returns the new query string, or null when the named list does not mention the removed id.
 */
export function swapIdInFilterQuery(query: string, param: string, removedId: number, survivorId: number): string | null {
  const params = new URLSearchParams(query);
  const current = params.get(param);
  if (current === null) return null;
  const ids = current.split(",").filter((part) => part !== "");
  if (!ids.includes(String(removedId))) return null;
  const next: string[] = [];
  for (const id of ids) {
    const swapped = id === String(removedId) ? String(survivorId) : id;
    if (!next.includes(swapped)) next.push(swapped);
  }
  params.set(param, next.join(","));
  return params.toString().replace(/%2C/g, ",");
}
