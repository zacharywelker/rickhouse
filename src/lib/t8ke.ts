/**
 * The t8ke scale.
 *
 * A bare 0–10 invites a 100-point mental model where 7 reads as mediocre. On
 * this scale 5 is average and genuinely good — which is the whole point of it,
 * since Jay West built it because the industry saturates 86–93 on hundred-point
 * scales and never uses the bottom two thirds.
 *
 * ⚠ PROVENANCE. t8ke.com is unreachable from the build environment (the egress
 * proxy blocks it), so these descriptions come from secondary sources and at
 * least some of them describe a *modified* version of the scale rather than the
 * original. They are deliberately kept in this one constant so correcting them
 * is a single edit. Check them against t8ke.com before treating the tooltip as
 * authoritative.
 */
export const T8KE_SCALE: ReadonlyArray<{ score: number; name: string; note: string }> = [
  { score: 0, name: "Fail", note: "Undrinkable." },
  { score: 1, name: "Disgusting", note: "So bad I poured it out." },
  { score: 2, name: "Poor", note: "Wince-inducing." },
  { score: 3, name: "Bad", note: "Drinkable, but why." },
  { score: 4, name: "Serviceable", note: "Mixing or ice recommended." },
  { score: 5, name: "Good", note: "Drinkable neat. This is average, not a failure." },
  { score: 6, name: "Very Good", note: "Any flaws offset by interesting flavours." },
  { score: 7, name: "Great", note: "Worth seeking out." },
  { score: 8, name: "Excellent", note: "Serve to impress guests." },
  { score: 9, name: "Incredible", note: "One of the best you have had." },
  { score: 10, name: "Perfect", note: "A reference bottle." },
];

export const T8KE_SUMMARY =
  "Scored 0–10 on the t8ke scale, where 5 is average and genuinely good — not the 100-point scale's 5.";
