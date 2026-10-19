"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { parseInput, toActionResult, toFailure, type ActionFailure, type TournamentActionResult } from "@/lib/tournaments/action-result";
import { fieldCandidates, labelCandidates, type FieldCandidate, type LabelCandidate } from "@/lib/tournaments/field";
import { parseFieldFilters } from "@/lib/tournaments/field-filters";
import { createSchema, glassSchema, moveSchema, patchSchema, promoteSchema, renameSchema, resultSchema, swapSchema } from "@/lib/tournaments/api-schemas";
import { drawHeat, moveEntry, promoteEntry, recordHeat, removeDraftEntry, renameHeat, setGlasses, swapEntries, undoHeat, withdrawEntry, type DrawnHeat } from "@/lib/tournaments/heats";
import { createTournament, deleteTournament, resetRound, startTournament, updateDraft } from "@/lib/tournaments/lifecycle";
import type { Failure } from "@/lib/tournaments/state";

const isId = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
const goneTournament: ActionFailure = { ok: false, error: "That tournament is gone." };
const goneFlight: ActionFailure = { ok: false, error: "That flight is gone." };
const goneEntry: ActionFailure = { ok: false, error: "That entry is gone." };

/** The list and the tournament's page read from the database on every request, but their cached payloads must not outlive a change. */
function refresh(id: number): void {
  revalidatePath("/tournaments");
  revalidatePath(`/tournaments/${id}`);
}

/** Runs a command that answers with the new view, and refreshes the pages when it was done. */
async function view(id: number, run: () => Promise<Awaited<ReturnType<typeof updateDraft>>>): Promise<TournamentActionResult> {
  const outcome = toActionResult(await run());
  if (outcome.ok) refresh(id);
  return outcome;
}

export async function createTournamentAction(input: unknown): Promise<{ ok: true; id: number } | ActionFailure> {
  const user = await requireSession();
  const body = parseInput(createSchema, input);
  if (!body.ok) return body;
  const { entries, ...settings } = body.data;
  const result = await createTournament(user.id, settings, entries);
  if (!result.ok) return toFailure(result);
  refresh(result.id);
  return { ok: true, id: result.id };
}

export async function updateDraftAction(id: number, patch: unknown): Promise<TournamentActionResult> {
  const user = await requireSession();
  if (!isId(id)) return goneTournament;
  const body = parseInput(patchSchema, patch);
  if (!body.ok) return body;
  return view(id, () => updateDraft(user.id, id, body.data));
}

export async function deleteTournamentAction(id: number): Promise<{ ok: true } | ActionFailure> {
  const user = await requireSession();
  if (!isId(id)) return goneTournament;
  const result: { ok: true } | Failure = await deleteTournament(user.id, id);
  if (!result.ok) return toFailure(result);
  refresh(id);
  return { ok: true };
}

export async function startTournamentAction(id: number): Promise<TournamentActionResult> {
  const user = await requireSession();
  if (!isId(id)) return goneTournament;
  return view(id, () => startTournament(user.id, id));
}

export async function resetRoundAction(id: number): Promise<TournamentActionResult> {
  const user = await requireSession();
  if (!isId(id)) return goneTournament;
  return view(id, () => resetRound(user.id, id));
}

/** `input` is `{ ranking: entryId[] }` best first, or for a flight poured blind `{ glasses: letter[] }` best first. */
export async function recordHeatAction(id: number, heatId: number, input: unknown): Promise<TournamentActionResult> {
  const user = await requireSession();
  if (!isId(id)) return goneTournament;
  if (!isId(heatId)) return goneFlight;
  const body = parseInput(resultSchema, input);
  if (!body.ok) return body;
  return view(id, () => recordHeat(user.id, id, heatId, body.data, user.id));
}

export async function undoHeatAction(id: number, heatId: number): Promise<TournamentActionResult> {
  const user = await requireSession();
  if (!isId(id)) return goneTournament;
  if (!isId(heatId)) return goneFlight;
  return view(id, () => undoHeat(user.id, id, heatId));
}

export async function withdrawEntryAction(id: number, entryId: number): Promise<TournamentActionResult> {
  const user = await requireSession();
  if (!isId(id)) return goneTournament;
  if (!isId(entryId)) return goneEntry;
  return view(id, () => withdrawEntry(user.id, id, entryId));
}

export async function removeDraftEntryAction(id: number, entryId: number): Promise<TournamentActionResult> {
  const user = await requireSession();
  if (!isId(id)) return goneTournament;
  if (!isId(entryId)) return goneEntry;
  return view(id, () => removeDraftEntry(user.id, id, entryId));
}

/** For the pourer: the answer names what is in each glass, so it is never put in the page's own view. */
export async function drawHeatAction(id: number, heatId?: number): Promise<{ ok: true; heat: DrawnHeat } | ActionFailure> {
  const user = await requireSession();
  if (!isId(id)) return goneTournament;
  if (heatId !== undefined && !isId(heatId)) return goneFlight;
  const result = await drawHeat(user.id, id, heatId);
  if (!result.ok) return toFailure(result);
  refresh(id);
  return { ok: true, heat: result.heat };
}

export async function setGlassesAction(id: number, heatId: number, assign: unknown): Promise<TournamentActionResult> {
  const user = await requireSession();
  if (!isId(id)) return goneTournament;
  if (!isId(heatId)) return goneFlight;
  const body = parseInput(glassSchema, { assign });
  if (!body.ok) return body;
  return view(id, () => setGlasses(user.id, id, heatId, body.data.assign));
}

export async function moveEntryAction(id: number, entryId: number, toHeatId: number): Promise<TournamentActionResult> {
  const user = await requireSession();
  if (!isId(id)) return goneTournament;
  if (!isId(entryId)) return goneEntry;
  const body = parseInput(moveSchema, { toHeatId });
  if (!body.ok) return body;
  return view(id, () => moveEntry(user.id, id, entryId, body.data.toHeatId));
}

export async function swapEntriesAction(id: number, entryId: number, withEntryId: number): Promise<TournamentActionResult> {
  const user = await requireSession();
  if (!isId(id)) return goneTournament;
  if (!isId(entryId)) return goneEntry;
  const body = parseInput(swapSchema, { withEntryId });
  if (!body.ok) return body;
  return view(id, () => swapEntries(user.id, id, entryId, body.data.withEntryId));
}

/** `target` is `{ bottleId }` or `{ expressionId }`. */
export async function promoteEntryAction(id: number, entryId: number, target: unknown): Promise<TournamentActionResult> {
  const user = await requireSession();
  if (!isId(id)) return goneTournament;
  if (!isId(entryId)) return goneEntry;
  const body = parseInput(promoteSchema, target);
  if (!body.ok) return body;
  return view(id, () => promoteEntry(user.id, id, entryId, body.data));
}

/** `label` is the new name (up to 80 characters); null or an empty string clears it. */
export async function renameHeatAction(id: number, heatId: number, label: string | null): Promise<TournamentActionResult> {
  const user = await requireSession();
  if (!isId(id)) return goneTournament;
  if (!isId(heatId)) return goneFlight;
  const body = parseInput(renameSchema, { label });
  if (!body.ok) return body;
  return view(id, () => renameHeat(user.id, id, heatId, body.data.label));
}

/** The setup picker's search: your bottles that match, and how many match in all. `rawFilters` is whatever the page holds; junk falls back to the defaults. */
export async function searchFieldAction(rawFilters: unknown): Promise<{ ok: true; rows: FieldCandidate[]; total: number }> {
  const user = await requireSession();
  const { rows, total } = await fieldCandidates(user.id, parseFieldFilters(rawFilters));
  return { ok: true, rows, total };
}

/** Your labels that match what was typed, for adding a label you own no bottle of. */
export async function searchLabelsAction(q: unknown): Promise<{ ok: true; labels: LabelCandidate[] }> {
  const user = await requireSession();
  const text = typeof q === "string" ? q.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  return { ok: true, labels: await labelCandidates(user.id, text) };
}
