"use client";

import * as React from "react";
import type { ReactNode } from "react";
import { categoryColorVar } from "@/lib/bottles/category-color";
import { hashSeed, seededRandom, seededRange } from "@/lib/seeded-random";
import { OBSTACLE_WEIGHT, placeStamps, type Obstacle } from "@/lib/bottles/stamp-placement";

/**
 * A designation printed like a customs stamp pressed onto the page itself
 * — outline ink in a color fixed per designation (see `STAMP_COLORS`
 * below), worn rather than a clean vector: broken dashes where the rubber
 * didn't quite seat, a soft
 * directional fade for uneven hand pressure, and one or two blots where
 * the pad ran dry. Replaces every designation that used to be a plain-text
 * / handwritten-margin-note badge (Bottled in Bond, Straight, Cask
 * Strength, Single Barrel, Private Selection, NAS); see the Issue #65
 * mockup this was built from.
 *
 * Every random-looking property comes from a seed, never `Math.random()` —
 * a stamp is a property of *this bottle's page* (like Polaroid's tilt and
 * Tape's `randomLook()` comment both note), so it looks the same on every
 * visit and only moves if the seed itself changes.
 */
export type StampKind = "bottled-in-bond" | "cask-strength" | "straight" | "nas" | "single-barrel" | "private-selection";

/** A handful of hand-tunable dash/gap lengths, drawn from the seed so no two stamps break in the same places. */
function distressDashes(rng: () => number, segments: number): string {
  const parts: number[] = [];
  for (let i = 0; i < segments; i++) {
    parts.push(seededRange(rng, 9, 30)); // ink
    parts.push(seededRange(rng, 2, 5.5)); // skip
  }
  return parts.map((n) => n.toFixed(1)).join(" ");
}

function StampDefs({ id, rng }: { id: string; rng: () => number }) {
  // A fade axis in a random direction each time, so the "heavy hand on one
  // side" reads differently per stamp instead of always top-left to
  // bottom-right.
  const angle = seededRange(rng, 0, 360) * (Math.PI / 180);
  const dx = Math.cos(angle) * 0.5;
  const dy = Math.sin(angle) * 0.5;
  const x1 = (0.5 - dx).toFixed(2);
  const y1 = (0.5 - dy).toFixed(2);
  const x2 = (0.5 + dx).toFixed(2);
  const y2 = (0.5 + dy).toFixed(2);
  // How far the fade dims the far side. This stays shallow on purpose —
  // the whole stamp is already faint (rendered at low opacity, behind the
  // page's real content), so an aggressive fade on top of that can erase
  // an entire arc of text instead of reading as gentle unevenness.
  const floor = Math.round(seededRange(rng, 78, 92));

  return (
    <defs>
      <filter id={`${id}-soft`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="0.35" />
      </filter>
      <filter id={`${id}-patch`} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" />
      </filter>
      <linearGradient id={`${id}-fade`} x1={x1} y1={y1} x2={x2} y2={y2}>
        <stop offset="0" stopColor="#fff" />
        <stop offset="0.55" stopColor="#fff" />
        <stop offset="0.8" stopColor={`hsl(0 0% ${floor}%)`} />
        <stop offset="1" stopColor={`hsl(0 0% ${Math.max(65, floor - 10)}%)`} />
      </linearGradient>
      <mask id={`${id}-mask`}>
        <rect x="0" y="0" width="160" height="160" fill={`url(#${id}-fade)`} />
      </mask>
    </defs>
  );
}

/** One or two paper-colored, blurred blots where the pad ran properly dry — placed near the shape's edge, not scattered evenly. */
function DryPatches({ id, rng }: { id: string; rng: () => number }) {
  const count = rng() < 0.55 ? 1 : 2;
  const patches = Array.from({ length: count }, () => {
    const edgeAngle = seededRange(rng, 0, 360);
    const edgeRadius = seededRange(rng, 55, 72);
    const cx = 80 + Math.cos((edgeAngle * Math.PI) / 180) * edgeRadius;
    const cy = 80 + Math.sin((edgeAngle * Math.PI) / 180) * edgeRadius;
    return {
      cx: cx.toFixed(1),
      cy: cy.toFixed(1),
      rx: seededRange(rng, 10, 17).toFixed(1),
      ry: seededRange(rng, 7, 12).toFixed(1),
      rotate: seededRange(rng, -30, 30).toFixed(1),
    };
  });
  return (
    <g filter={`url(#${id}-patch)`} opacity="0.75">
      {patches.map((p, i) => (
        <ellipse
          key={i}
          cx={p.cx}
          cy={p.cy}
          rx={p.rx}
          ry={p.ry}
          fill="var(--color-paper, #fffefa)"
          transform={`rotate(${p.rotate} ${p.cx} ${p.cy})`}
        />
      ))}
    </g>
  );
}

const SERIF = "Georgia, 'Times New Roman', serif";

/** A circular customs-ring stamp: two arced phrases plus one or two big center lines. Bottled-in-Bond and Cask Strength. */
function RingMark({
  id,
  color,
  rng,
  topArc,
  bottomArc,
  centerLines,
  caption,
}: {
  id: string;
  color: string;
  rng: () => number;
  topArc: string;
  bottomArc: string;
  centerLines: string[];
  caption?: string;
}) {
  const centerStartY = centerLines.length > 1 ? 80 : 90;
  return (
    <>
      <StampDefs id={id} rng={rng} />
      <g mask={`url(#${id}-mask)`} filter={`url(#${id}-soft)`}>
        <circle cx="80" cy="80" r="74" fill="none" stroke={color} strokeWidth="2.5" strokeDasharray={distressDashes(rng, 5)} />
        <path id={`${id}-top`} d="M 80,80 m -56,0 a 56,56 0 1,1 112,0" fill="none" />
        <path id={`${id}-bot`} d="M 80,80 m -56,0 a 56,56 0 1,0 112,0" fill="none" />
        <text fill={color} fontSize="13" fontWeight="700" letterSpacing="1.2">
          <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">
            {topArc}
          </textPath>
        </text>
        <text fill={color} fontSize="13" fontWeight="700" letterSpacing="1.2">
          <textPath href={`#${id}-bot`} startOffset="50%" textAnchor="middle">
            {bottomArc}
          </textPath>
        </text>
        {centerLines.map((line, i) => (
          <text
            key={i}
            x="80"
            y={centerStartY + i * 18}
            textAnchor="middle"
            fill={color}
            fontSize="16"
            fontWeight="700"
            fontFamily={SERIF}
          >
            {line}
          </text>
        ))}
        {caption ? (
          <text x="80" y={centerStartY + centerLines.length * 18 - 2} textAnchor="middle" fill={color} fontSize="8.5" letterSpacing="1.5">
            {caption}
          </text>
        ) : null}
      </g>
      <DryPatches id={id} rng={rng} />
    </>
  );
}

/**
 * Greedy word-wrap into at most two lines — the ledger box only has room
 * for two rows of small caps below the center word. A picker's name
 * ("Picked by ...") is the one piece of free text a ledger stamp shows, so
 * unlike every other label here it can't be sized to fit in advance.
 * Anything past two lines is folded into the second rather than dropped,
 * since a slightly long second line beats truncating someone's name.
 */
function wrapBottomLine(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length > 2) return [lines[0]!, lines.slice(1).join(" ")];
  return lines;
}

/** A ledger-box stamp: a top line, one big center word, a bottom line (or two, for a name that doesn't fit one). Straight, NAS, Private Selection. */
function LedgerMark({
  id,
  color,
  rng,
  topText,
  centerText,
  bottomText,
}: {
  id: string;
  color: string;
  rng: () => number;
  topText: string;
  centerText: string;
  bottomText: string;
}) {
  const bottomLines = wrapBottomLine(bottomText, 16);
  const wrapped = bottomLines.length > 1;
  return (
    <>
      <StampDefs id={id} rng={rng} />
      <g mask={`url(#${id}-mask)`} filter={`url(#${id}-soft)`}>
        <g fill="none" stroke={color} strokeWidth="2">
          <rect x="15" y="40" width="130" height="80" rx="3" strokeDasharray={distressDashes(rng, 4)} />
          <rect x="20" y="45" width="120" height="70" rx="2" strokeDasharray={distressDashes(rng, 4)} />
        </g>
        <line x1="20" y1="65" x2="140" y2="65" stroke={color} strokeWidth="1" />
        <line x1="20" y1="95" x2="140" y2="95" stroke={color} strokeWidth="1" />
        <text x="80" y="57" textAnchor="middle" fill={color} fontSize="8.5" fontWeight="700" letterSpacing="1.5">
          {topText}
        </text>
        <text x="80" y="84" textAnchor="middle" fill={color} fontSize="20" fontWeight="700" letterSpacing="1" fontFamily={SERIF}>
          {centerText}
        </text>
        {bottomLines.map((line, i) => (
          <text
            key={i}
            x="80"
            y={wrapped ? 101 + i * 9 : 106}
            textAnchor="middle"
            fill={color}
            fontSize={wrapped ? "7.5" : "9"}
            fontWeight="700"
            letterSpacing={wrapped ? "1" : "2"}
          >
            {line}
          </text>
        ))}
      </g>
      <DryPatches id={id} rng={rng} />
    </>
  );
}

/** A half-dome stamp with a flat, starred baseline. Single Barrel. */
function DomeMark({
  id,
  color,
  rng,
  arcText,
  centerLines,
}: {
  id: string;
  color: string;
  rng: () => number;
  arcText: string;
  centerLines: string[];
}) {
  return (
    <>
      <StampDefs id={id} rng={rng} />
      <g mask={`url(#${id}-mask)`} filter={`url(#${id}-soft)`}>
        <path
          id={`${id}-dome`}
          d="M 14,104 A 66,66 0 0 1 146,104"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={distressDashes(rng, 4)}
        />
        <line x1="14" y1="104" x2="146" y2="104" stroke={color} strokeWidth="2.5" />
        <path id={`${id}-arc`} d="M 24,104 A 56,56 0 0 1 136,104" fill="none" />
        <text fill={color} fontSize="12.5" fontWeight="700" letterSpacing="1.5">
          <textPath href={`#${id}-arc`} startOffset="50%" textAnchor="middle">
            {arcText}
          </textPath>
        </text>
        {centerLines.map((line, i) => (
          <text key={i} x="80" y={76 + i * 20} textAnchor="middle" fill={color} fontSize="16" fontWeight="700" fontFamily={SERIF}>
            {line}
          </text>
        ))}
        <text x="26" y="114" textAnchor="middle" fill={color} fontSize="12">
          &#9733;
        </text>
        <text x="134" y="114" textAnchor="middle" fill={color} fontSize="12">
          &#9733;
        </text>
      </g>
      <DryPatches id={id} rng={rng} />
    </>
  );
}

/**
 * One fixed ink per designation, not the bottle's own category color —
 * six stamps sharing a single hue (every whiskey bottle's marks all in
 * the same orange, say) would read as one repeated badge rather than six
 * distinct kinds of mark, especially once several land on the same page.
 * Spread around the wheel on purpose (ink, red, brown, blue, purple,
 * green) so no two are a shade of the same color; pulled from tokens the
 * app already uses elsewhere (category colors, the ink/primary token)
 * rather than new one-off hexes.
 */
const STAMP_COLORS: Record<StampKind, string> = {
  "bottled-in-bond": "var(--foreground)",
  "cask-strength": categoryColorVar("rum"),
  straight: categoryColorVar("brandy"),
  nas: categoryColorVar("vodka"),
  "single-barrel": categoryColorVar("liqueur"),
  "private-selection": categoryColorVar("gin"),
};

/** The graphic alone, unpositioned — `size` is the rendered square in px. `detail` overrides the piece of the design that carries real per-bottle data (a proof, a barrel number, a picker's name). */
export function BottleStamp({
  kind,
  seed,
  detail,
  size = 200,
  className,
}: {
  kind: StampKind;
  seed: number;
  /** Real per-bottle data shown in place of the stamp's generic center/caption text, where it has one (proof for Cask Strength, barrel number for Single Barrel, picker for Private Selection). */
  detail?: string;
  size?: number;
  className?: string;
}) {
  const id = `stamp-${kind}-${seed}`;
  const color = STAMP_COLORS[kind];
  const rng = seededRandom(seed);
  let mark: ReactNode;
  switch (kind) {
    case "bottled-in-bond":
      mark = (
        <RingMark
          id={id}
          color={color}
          rng={rng}
          topArc="U.S. TREASURY"
          bottomArc="DISTILLERY NO. 12"
          centerLines={["BOTTLED", "IN BOND"]}
          caption="100 PROOF"
        />
      );
      break;
    case "cask-strength":
      mark = (
        <RingMark
          id={id}
          color={color}
          rng={rng}
          topArc="CASK STRENGTH"
          bottomArc="BARREL PROOF"
          centerLines={[detail ?? "UNCUT"]}
        />
      );
      break;
    case "straight":
      mark = (
        <LedgerMark id={id} color={color} rng={rng} topText="AT LEAST 2 YEARS" centerText="STRAIGHT" bottomText="ADDITIVE FREE" />
      );
      break;
    case "nas":
      mark = <LedgerMark id={id} color={color} rng={rng} topText="UNDATED · UNAGED" centerText="NAS" bottomText="AS BOTTLED" />;
      break;
    case "private-selection":
      mark = (
        <LedgerMark
          id={id}
          color={color}
          rng={rng}
          topText="STORE PICK"
          centerText="SELECTION"
          bottomText={detail ?? "SINGLE BARREL PICK"}
        />
      );
      break;
    case "single-barrel":
      mark = <DomeMark id={id} color={color} rng={rng} arcText="SINGLE BARREL" centerLines={[detail ?? "ONE CASK"]} />;
      break;
  }
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} className={className} aria-hidden="true">
      {mark}
    </svg>
  );
}

/** One designation flag, and who it belongs to (an expression id for a label-level fact, a bottle id for a per-copy one) — ink and tilt are both seeded off that owner so a fact shared by every bottle of an expression prints identically on each of their pages. */
export interface StampSpec {
  kind: StampKind;
  ownerId: number;
  active: boolean;
  detail?: string;
}

// Fixed so the strip reads in the same order on every page, whatever order
// callers happen to list flags in.
const KIND_ORDER: StampKind[] = ["bottled-in-bond", "cask-strength", "straight", "nas", "single-barrel", "private-selection"];

/** What each stamp says, in words — the stamps are drawings, so this is their readable equivalent. */
const KIND_LABEL: Record<StampKind, string> = {
  "bottled-in-bond": "Bottled in Bond",
  "cask-strength": "Cask strength",
  straight: "Straight",
  nas: "No age statement",
  "single-barrel": "Single barrel",
  "private-selection": "Private selection",
};

function designationText(spec: StampSpec): string {
  return spec.detail ? `${KIND_LABEL[spec.kind]} (${spec.detail})` : KIND_LABEL[spec.kind];
}

function activeStamps(stamps: StampSpec[]): StampSpec[] {
  return KIND_ORDER.map((kind) => stamps.find((s) => s.kind === kind && s.active)).filter(
    (s): s is StampSpec => s !== undefined,
  );
}

/**
 * The stamps say something a screen reader should hear too. The drawings are
 * aria-hidden (and live in a background layer read out of order), so this
 * sits in the page where the fact belongs and says it in words.
 */
export function StampDesignations({ stamps }: { stamps: StampSpec[] }) {
  const active = activeStamps(stamps);
  if (active.length === 0) return null;
  return <p className="sr-only">Designations: {active.map(designationText).join(", ")}</p>;
}

const CONTROL_SELECTOR =
  "a, button, input, select, textarea, label, summary, [role=button], [role=slider], [role=radio], [role=checkbox]";
const MEDIA_SELECTOR = "img, svg, video, canvas";

/** Zero alpha in either syntax a browser reports: legacy `rgba(…, 0)` or modern `… / 0)`. */
function isTransparent(color: string): boolean {
  return color === "transparent" || /^rgba\([^)]*,\s*0\)$/.test(color) || /\/\s*0\)$/.test(color);
}

/**
 * Everything on the page a stamp should keep clear of, relative to
 * `container`. Text is measured line by line rather than by its element,
 * so a short value in a wide grid cell leaves the rest of the cell free.
 * Controls, photos and anything with a surface of its own (a card, the
 * Polaroid, a chip, a boxed empty state) count whole — a stamp behind an
 * opaque surface disappears, and behind a control it reads as part of it.
 * Thin rules don't count: a stamp crossing a divider is exactly the look.
 */
function measureObstacles(container: HTMLElement, layer: HTMLElement): Obstacle[] {
  const origin = container.getBoundingClientRect();
  const obstacles: Obstacle[] = [];
  const add = (rect: DOMRect, weight: number) => {
    if (rect.width < 1 || rect.height < 1) return;
    obstacles.push({ x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height, weight });
  };

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || !node.textContent?.trim() || layer.contains(parent) || parent.closest(".sr-only")) continue;
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) add(rect, OBSTACLE_WEIGHT.text);
  }

  for (const el of container.querySelectorAll<HTMLElement>("*")) {
    if (el === layer || layer.contains(el)) continue;
    if (el.matches(CONTROL_SELECTOR)) {
      add(el.getBoundingClientRect(), OBSTACLE_WEIGHT.control);
      continue;
    }
    // An icon inside a control is already covered by the control.
    if (el.matches(MEDIA_SELECTOR) && !el.parentElement?.closest(CONTROL_SELECTOR)) {
      add(el.getBoundingClientRect(), OBSTACLE_WEIGHT.surface);
      continue;
    }
    const style = getComputedStyle(el);
    const boxed = ["Top", "Right", "Bottom", "Left"].every(
      (side) => parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0,
    );
    if (!isTransparent(style.backgroundColor) || style.backgroundImage !== "none" || boxed) {
      add(el.getBoundingClientRect(), OBSTACLE_WEIGHT.surface);
    }
  }
  return obstacles;
}

type Placed = { spec: StampSpec; x: number; y: number; size: number; rotate: number };

/**
 * The decorative layer for a bottle page: one stamp per true designation,
 * pressed into the page's background — always behind the real content, and
 * placed where the page is actually blank.
 *
 * Placement is measured, not guessed. It used to be seeded percentages of
 * the page, which could not know where the content ended up, so stamps
 * landed on buttons and text (DESIGN.md §41: a physical intervention never
 * obscures information). Now, once the page has laid out, the layer
 * measures what is on it and puts each stamp in the emptiest spot that
 * fits (src/lib/bottles/stamp-placement.ts). A seeded anchor per stamp
 * breaks ties between equally empty places, so every bottle still gets its
 * own arrangement, and it is re-measured whenever the page changes size or
 * content — a photo loading, a note added, a phone turned sideways.
 *
 * Render as the first child of a `relative` wrapper around the page; the
 * wrapper is what gets measured.
 */
export function BottleStamps({ stamps }: { stamps: StampSpec[] }) {
  const layerRef = React.useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = React.useState<Placed[]>([]);
  const active = activeStamps(stamps);
  const signature = active.map((s) => `${s.kind}:${s.ownerId}:${s.detail ?? ""}`).join("|");

  React.useEffect(() => {
    const layer = layerRef.current;
    const container = layer?.parentElement;
    if (!layer || !container || active.length === 0) return;

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const { width, height } = container.getBoundingClientRect();
        // Smaller on a phone, where a 200px stamp would be half the screen.
        const base = width < 640 ? 112 : 190;
        const requests = active.map((spec) => {
          const rng = seededRandom(hashSeed(`stamp-place-${spec.kind}-${spec.ownerId}`));
          return { size: base * seededRange(rng, 0.85, 1.1), anchor: { x: rng(), y: rng() } };
        });
        const spots = placeStamps(width, height, measureObstacles(container, layer), requests);
        setPlaced(
          spots.map((spot, i) => ({
            spec: active[i]!,
            ...spot,
            rotate: seededRange(seededRandom(hashSeed(`stamp-rotate-${active[i]!.kind}-${active[i]!.ownerId}`)), -18, 18),
          })),
        );
      });
    };

    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(container);
    // Content can change without the page changing size (a chip added, a
    // note edited). Mutations inside this layer are its own re-render.
    const mutation = new MutationObserver((records) => {
      if (records.some((record) => !layer.contains(record.target))) measure();
    });
    mutation.observe(container, { childList: true, subtree: true, characterData: true });
    void document.fonts?.ready.then(measure);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
    };
    // `signature` stands in for `active`, which is a fresh array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (active.length === 0) return null;

  return (
    <div ref={layerRef} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {placed.map(({ spec, x, y, size, rotate }) => (
        <div
          key={spec.kind}
          className="absolute"
          style={{
            left: x,
            top: y,
            width: size,
            height: size,
            transform: `rotate(${rotate.toFixed(1)}deg)`,
            opacity: 0.55,
          }}
        >
          <BottleStamp
            kind={spec.kind}
            seed={hashSeed(`stamp-ink-${spec.kind}-${spec.ownerId}`)}
            detail={spec.detail}
            size={Math.round(size)}
            className="size-full"
          />
        </div>
      ))}
    </div>
  );
}
