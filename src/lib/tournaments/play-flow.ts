/** Glass letters a flight can use, from A (the server's set). */
export const lettersFor = (count: number): string[] => ["A", "B", "C", "D"].slice(0, count);

/** The list with the item at `index` moved by `delta` places; the same list when that runs off either end. */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

/** A random order of the first `count` letters (Fisher-Yates); `random` is injectable for tests. */
export function shuffledLetters(count: number, random: () => number = Math.random): string[] {
  const letters = lettersFor(count);
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [letters[i], letters[j]] = [letters[j]!, letters[i]!];
  }
  return letters;
}

/** Why these letters cannot be saved, or null: every bottle needs a different letter from A up. */
export function lettersProblem(glasses: readonly (string | null)[]): string | null {
  const allowed = new Set(lettersFor(glasses.length));
  if (glasses.some((g) => g === null || !allowed.has(g))) return `Give every bottle a letter from ${lettersFor(glasses.length).join(", ")}.`;
  if (new Set(glasses).size !== glasses.length) return "Each bottle needs its own letter.";
  return null;
}

/** A bottle in the pourer's set-up screen. Names live only in this stage. */
export type MappingRow = { entryId: number; name: string; proof: number | null; mashbill: string | null; ageYears: number | null; glass: string };

export type Flow =
  | { stage: "start" }
  | { stage: "loading" }
  | { stage: "mapping"; rows: MappingRow[]; saved: boolean; /** The letters the server has. */ base: string[] }
  | { stage: "rank"; order: string[] }
  | { stage: "revealed" };

export type FlowAction =
  | { type: "show" }
  | { type: "loaded"; rows: MappingRow[] }
  | { type: "failed" }
  | { type: "setGlass"; entryId: number; glass: string }
  | { type: "setAll"; letters: string[] }
  | { type: "saved"; /** The letters that were sent to the server. */ sent: { entryId: number; glass: string }[] }
  | { type: "hide" }
  | { type: "move"; index: number; delta: -1 | 1 }
  | { type: "recorded" };

/** The mapping with new rows; it counts as saved again when the letters are back to what the server has. */
function edited(state: Extract<Flow, { stage: "mapping" }>, rows: MappingRow[]): Flow {
  return { ...state, rows, saved: rows.every((r, i) => r.glass === state.base[i]) };
}

export const initialFlow = (drawn: boolean): Flow => (drawn ? { stage: "loading" } : { stage: "start" });

/**
 * The blind flight's stages. Once `hide` is taken the state holds only letters: the names are dropped, and nothing
 * but a new `show` (from `start`) can bring them back.
 */
export function flowReducer(state: Flow, action: FlowAction): Flow {
  switch (action.type) {
    case "show":
      return state.stage === "start" ? { stage: "loading" } : state;
    case "loaded":
      return state.stage === "loading" ? { stage: "mapping", rows: action.rows, saved: true, base: action.rows.map((r) => r.glass) } : state;
    case "failed":
      return state.stage === "loading" ? { stage: "start" } : state;
    case "setGlass":
      return state.stage === "mapping" ? edited(state, state.rows.map((r) => (r.entryId === action.entryId ? { ...r, glass: action.glass } : r))) : state;
    case "setAll":
      return state.stage === "mapping" ? edited(state, state.rows.map((r, i) => ({ ...r, glass: action.letters[i] ?? r.glass }))) : state;
    case "saved": {
      if (state.stage !== "mapping") return state;
      // The server has what was sent, not what is on screen now: letters changed during the save stay unsaved.
      const sent = new Map(action.sent.map((s) => [s.entryId, s.glass]));
      const base = state.rows.map((r) => sent.get(r.entryId) ?? r.glass);
      return { ...state, base, saved: state.rows.every((r, i) => r.glass === base[i]) };
    }
    case "hide": {
      if (state.stage !== "mapping" || !state.saved || lettersProblem(state.rows.map((r) => r.glass))) return state;
      return { stage: "rank", order: state.rows.map((r) => r.glass).sort() };
    }
    case "move":
      return state.stage === "rank" ? { stage: "rank", order: moveItem(state.order, action.index, action.delta) } : state;
    case "recorded":
      return { stage: "revealed" };
  }
}
