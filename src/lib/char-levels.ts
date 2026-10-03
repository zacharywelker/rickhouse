import { CHAR_LEVELS, type CharLevel } from "@/db/schema";

/**
 * What each char level means, for the stave drawing and the line under it.
 * Flame times are the figures coopers commonly quote (15 / 30 / 35 / 55 s);
 * they vary by cooperage, so they read as approximate.
 */
export type CharLevelDetail = {
  /** Under the "Flame" caption in the form. */
  flame: string;
  /** Next to the value on a label's page; empty when there was no flame. */
  flameShort: string;
  /** One line under the stave. Data entry, so one joke and out. */
  line: string;
  /** The slider's spoken value. */
  spoken: string;
  /** Layer depths as fractions of the stave's thickness. `toast` includes the char above it. */
  toast: number;
  char: number;
};

export const CHAR_LEVEL_DETAILS: Record<CharLevel, CharLevelDetail> = {
  none: { flame: "None", flameShort: "", line: "Bare oak. Nobody brought a lighter.", spoken: "No char", toast: 0, char: 0 },
  toasted: {
    flame: "None, just heat",
    flameShort: "",
    line: "Baked low and slow, never set on fire. This is where the vanilla comes from.",
    spoken: "Toasted, heat with no flame",
    toast: 0.3,
    char: 0,
  },
  "1": {
    flame: "≈ 15 s",
    flameShort: "≈ 15 s flame",
    line: "Fifteen seconds on fire. Barely a sunburn.",
    spoken: "Char 1, about 15 seconds of flame",
    toast: 0.32,
    char: 0.1,
  },
  "2": {
    flame: "≈ 30 s",
    flameShort: "≈ 30 s flame",
    line: "Half a minute. Properly blackened, still minding its manners.",
    spoken: "Char 2, about 30 seconds of flame",
    toast: 0.4,
    char: 0.2,
  },
  "3": {
    flame: "≈ 35 s",
    flameShort: "≈ 35 s flame",
    line: "The wood starts cracking. Somebody left it on a little long.",
    spoken: "Char 3, about 35 seconds of flame",
    toast: 0.5,
    char: 0.32,
  },
  "4": {
    flame: "≈ 55 s",
    flameShort: "≈ 55 s flame",
    line: "Nearly a minute on fire. The surface splits into scales, hence alligator.",
    spoken: "Char 4, alligator char, about 55 seconds of flame",
    toast: 0.62,
    char: 0.46,
  },
};

/** Unknown sits off the scale: the label isn't saying. */
export const CHAR_LEVEL_UNKNOWN = {
  line: "The label isn't saying. Leave it blank until someone spills.",
  spoken: "Unknown, not set",
};

export function isCharLevel(value: unknown): value is CharLevel {
  return typeof value === "string" && (CHAR_LEVELS as readonly string[]).includes(value);
}
