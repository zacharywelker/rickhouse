import type { z } from "zod";
import { issueFields } from "@/lib/api/v1";
import type { Failure } from "./state";
import type { TournamentView } from "./view";

/** What a tournament server action answers: the new page model, or why the command could not be done. */
export type ActionFailure = { ok: false; error: string; fieldErrors?: Record<string, string> };
export type TournamentActionResult = { ok: true; view: TournamentView } | ActionFailure;

/** A data-layer Failure as an action's failure: its message reads as it does in the API (a 404 says the tournament is gone). */
export function toFailure(failure: Failure): ActionFailure {
  return { ok: false, error: failure.message, ...(failure.fields ? { fieldErrors: failure.fields } : {}) };
}

/** A command's outcome as the action's answer. */
export function toActionResult(outcome: { ok: true; view: TournamentView } | Failure): TournamentActionResult {
  return outcome.ok ? { ok: true, view: outcome.view } : toFailure(outcome);
}

/** `input` checked against the same schema the API uses; the first issue is the message, each field's first issue goes to `fieldErrors`. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): { ok: true; data: z.infer<S> } | ActionFailure {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "Check the fields.", fieldErrors: issueFields(result.error.issues) };
}
