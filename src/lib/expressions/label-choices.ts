import "server-only";
import type { db } from "@/db";
import { nameBelongsToExpression } from "@/lib/other-names-store";
import { releaseBelongsToExpression } from "@/lib/releases-store";
import type { BottleInput } from "./schema";

/**
 * A chosen version or release has to be one of the bottle's own label's;
 * anything else means the label changed after it was picked (or the id was
 * never the caller's), and falls back to none. A chosen release replaces the
 * free-text batch and year, so the two can never disagree.
 */
export async function settleLabelChoices<T extends Pick<BottleInput, "expressionId" | "expressionNameId" | "releaseId" | "batch" | "releaseYear">>(
  input: T,
  query?: Pick<typeof db, "select">,
): Promise<T> {
  if (input.expressionNameId !== null && !(await nameBelongsToExpression(input.expressionNameId, input.expressionId, query))) {
    input.expressionNameId = null;
  }
  if (input.releaseId !== null && !(await releaseBelongsToExpression(input.releaseId, input.expressionId, query))) {
    input.releaseId = null;
  }
  if (input.releaseId !== null) {
    input.batch = null;
    input.releaseYear = null;
  }
  return input;
}
