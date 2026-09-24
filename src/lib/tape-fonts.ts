import { Ga_Maamli, Gochi_Hand, Just_Another_Hand, Permanent_Marker, Sedgwick_Ave_Display } from "next/font/google";

const permanentMarker = Permanent_Marker({ weight: "400", subsets: ["latin"], display: "swap" });
const gochiHand = Gochi_Hand({ weight: "400", subsets: ["latin"], display: "swap" });
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
 *
 * Lacquer used to be in this set. Its rigid, condensed all-caps strokes read
 * as a wanted-poster or horror-title typeface, not a hand — the opposite of
 * the "someone jotted this down" feel the other four go for — so it's out in
 * favor of Gochi Hand, a warmer, rounder scrawl.
 */
export const TAPE_FONTS = [permanentMarker, gochiHand, sedgwickAveDisplay, gaMaamli, justAnotherHand];
