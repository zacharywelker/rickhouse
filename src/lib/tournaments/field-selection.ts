import type { EntryInput } from "./lifecycle";

/** The most entries a tournament holds (the API's limit). */
export const MAX_ENTRIES = 500;
/** The longest an outside entry's name may be (the API's limit). */
export const MAX_NAME = 120;

export type PickedBottle = { kind: "bottle"; bottleId: number; expressionId: number; name: string };
export type PickedLabel = { kind: "label"; expressionId: number; name: string };
export type PickedAdhoc = { kind: "adhoc"; key: string; name: string };
export type PickedEntry = PickedBottle | PickedLabel | PickedAdhoc;

export type FieldState = {
  entries: PickedEntry[];
  /** Why the last action was refused or only partly done; null when it was done in full. */
  notice: string | null;
};

export type FieldAction =
  | { type: "toggleBottle"; bottle: PickedBottle }
  | { type: "selectAll"; bottles: PickedBottle[] }
  | { type: "clear" }
  | { type: "remove"; key: string }
  | { type: "addLabel"; label: { expressionId: number; name: string } }
  | { type: "addAdhoc"; name: string };

export const emptyField: FieldState = { entries: [], notice: null };

const CAP_NOTICE = `A tournament holds up to ${MAX_ENTRIES} entries.`;

/** A stable identity for an entry: a bottle and a label of the same expression are different entries. */
export function entryKey(entry: PickedEntry): string {
  return entry.kind === "bottle" ? `b:${entry.bottleId}` : entry.kind === "label" ? `l:${entry.expressionId}` : `a:${entry.key}`;
}

/** The identity of an outside entry: its name in lower case with runs of spaces made one. */
const adhocKey = (name: string): string => name.replace(/\s+/g, " ").trim().toLowerCase();

const ok = (entries: PickedEntry[]): FieldState => ({ entries, notice: null });
const refused = (state: FieldState, notice: string): FieldState => ({ entries: state.entries, notice });

/** The field being picked, as a pure reducer: nothing here knows about React or the network. */
export function fieldReducer(state: FieldState, action: FieldAction): FieldState {
  const { entries } = state;
  switch (action.type) {
    case "toggleBottle": {
      const key = entryKey(action.bottle);
      if (entries.some((e) => entryKey(e) === key)) return ok(entries.filter((e) => entryKey(e) !== key));
      if (entries.length >= MAX_ENTRIES) return refused(state, CAP_NOTICE);
      return ok([...entries, action.bottle]);
    }
    case "selectAll": {
      const have = new Set(entries.map(entryKey));
      const fresh = action.bottles.filter((b) => !have.has(entryKey(b)));
      const room = MAX_ENTRIES - entries.length;
      const next = [...entries, ...fresh.slice(0, Math.max(room, 0))];
      return fresh.length > room ? { entries: next, notice: `${CAP_NOTICE} The rest were left out.` } : ok(next);
    }
    case "clear":
      return emptyField;
    case "remove":
      return ok(entries.filter((e) => entryKey(e) !== action.key));
    case "addLabel": {
      const entry: PickedLabel = { kind: "label", expressionId: action.label.expressionId, name: action.label.name };
      if (entries.some((e) => entryKey(e) === entryKey(entry))) return refused(state, "That label is already in the field.");
      if (entries.length >= MAX_ENTRIES) return refused(state, CAP_NOTICE);
      return ok([...entries, entry]);
    }
    case "addAdhoc": {
      const name = action.name.replace(/\s+/g, " ").trim();
      if (name === "") return state;
      if (name.length > MAX_NAME) return refused(state, `Up to ${MAX_NAME} characters.`);
      const entry: PickedAdhoc = { kind: "adhoc", key: adhocKey(name), name };
      if (entries.some((e) => entryKey(e) === entryKey(entry))) return refused(state, "That outside entry is already in the field.");
      if (entries.length >= MAX_ENTRIES) return refused(state, CAP_NOTICE);
      return ok([...entries, entry]);
    }
  }
}

/** The field as the create action takes it. */
export function toEntryInputs(entries: readonly PickedEntry[]): EntryInput[] {
  return entries.map((e) =>
    e.kind === "bottle" ? { bottleId: e.bottleId } : e.kind === "label" ? { expressionId: e.expressionId } : { name: e.name },
  );
}

export function counts(entries: readonly PickedEntry[]): { bottles: number; labels: number; adhoc: number; total: number } {
  const of = (kind: PickedEntry["kind"]) => entries.filter((e) => e.kind === kind).length;
  return { bottles: of("bottle"), labels: of("label"), adhoc: of("adhoc"), total: entries.length };
}

/** How many of the bottles on show are in the field. */
export function chosenAmong(entries: readonly PickedEntry[], shown: readonly { bottleId: number }[]): number {
  const have = new Set(entries.filter((e): e is PickedBottle => e.kind === "bottle").map((e) => e.bottleId));
  return shown.filter((b) => have.has(b.bottleId)).length;
}
