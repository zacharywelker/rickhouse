import { Ga_Maamli, Just_Another_Hand, Lacquer, Permanent_Marker, Sedgwick_Ave_Display } from "next/font/google";

const permanentMarker = Permanent_Marker({ weight: "400", subsets: ["latin"], display: "swap" });
const lacquer = Lacquer({ weight: "400", subsets: ["latin"], display: "swap" });
const sedgwickAveDisplay = Sedgwick_Ave_Display({ weight: "400", subsets: ["latin"], display: "swap" });
const gaMaamli = Ga_Maamli({ weight: "400", subsets: ["latin"], display: "swap" });
const justAnotherHand = Just_Another_Hand({ weight: "400", subsets: ["latin"], display: "swap" });

/**
 * The tape's handwriting isn't one font — DESIGN.md §28 wants handwriting to
 * read as an annotation, not a second UI typeface, and a single marker face
 * used everywhere would itself become "the app's quirky font" (the exact
 * anti-pattern DESIGN-TOKENS.md §54 warns against). Rotating through a small
 * set instead (Tape.tsx picks one per mount) keeps each label looking like a
 * different trip to the junk drawer for whatever marker was closest.
 */
export const TAPE_FONTS = [permanentMarker, lacquer, sedgwickAveDisplay, gaMaamli, justAnotherHand];
