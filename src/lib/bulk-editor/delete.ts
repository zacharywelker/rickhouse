export type DeleteIds = { labelIds: number[]; bottleIds: number[] };
export type DeleteImpact = { labels: number; bottlesOnLabels: number; bottles: number };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What a delete will do, said before it is done. Rows are labels in the Labels-only view, where a label goes with every
 * bottle on it (the server's count, which includes bottles that are sold or on a wishlist and so are not on the sheet);
 * everywhere else they are bottles, which go alone: their label stays, even if it was the label's last bottle.
 */
export function deleteSentence(ids: DeleteIds, impact: DeleteImpact): { title: string; body: string } {
  if (ids.labelIds.length > 0) {
    const them = impact.labels === 1 ? "it" : "them";
    const title = `Delete ${plural(impact.labels, "label", "labels")}?`;
    if (impact.bottlesOnLabels === 0) return { title, body: `Delete ${plural(impact.labels, "label", "labels")}. There are no bottles on ${them}.` };
    return { title, body: `Delete ${plural(impact.labels, "label", "labels")} and the ${plural(impact.bottlesOnLabels, "bottle", "bottles")} on ${them}.` };
  }
  const one = impact.bottles === 1;
  return {
    title: `Delete ${plural(impact.bottles, "bottle", "bottles")}?`,
    body: `Delete ${plural(impact.bottles, "bottle", "bottles")}. ${one ? "Its label stays" : "Their labels stay"}, even if ${one ? "this was" : "one was"} the last bottle on ${one ? "it" : "its label"}.`,
  };
}

/** The ids a row key stands for: `b12` is bottle 12, `l7` is label 7. */
export function idsOfKeys(keys: ReadonlyArray<string>): DeleteIds {
  const num = (key: string) => Number(key.slice(1));
  return { labelIds: keys.filter((k) => k.startsWith("l")).map(num), bottleIds: keys.filter((k) => k.startsWith("b")).map(num) };
}

/** The row key for something the server says it could not delete. */
export const keyOf = (kind: "label" | "bottle", id: number): string => `${kind === "label" ? "l" : "b"}${id}`;
