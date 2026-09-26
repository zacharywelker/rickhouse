import type { ReactNode } from "react";
import { categoryColorVar } from "@/lib/bottles/category-color";
import { hashSeed, seededRandom, seededRange } from "@/lib/seeded-random";

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

/**
 * The bottle's designations as a strip of inked stamps: one per true flag,
 * each at its own seeded tilt, catching a neighbour's edge the way stamps
 * crowd a passport page.
 *
 * In the page flow, not scattered behind it. They used to be placed at
 * seeded percentages of the whole page, which could not know where the
 * content ended up — so they landed on buttons and text, the one thing
 * DESIGN.md §41 says a physical intervention must never do. A strip of its
 * own keeps the ink and the tilt and gives every stamp somewhere it cannot
 * cover anything.
 *
 * The drawings are aria-hidden; the list beside them says the same thing
 * in words, so a screen reader hears "Bottled in Bond" rather than nothing.
 */
export function BottleStamps({ stamps }: { stamps: StampSpec[] }) {
  const active = KIND_ORDER.map((kind) => stamps.find((s) => s.kind === kind && s.active)).filter(
    (s): s is StampSpec => s !== undefined,
  );
  if (active.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center py-1">
      <p className="sr-only">
        Designations:{" "}
        {active.map((spec) => (spec.detail ? `${KIND_LABEL[spec.kind]} (${spec.detail})` : KIND_LABEL[spec.kind])).join(", ")}
      </p>
      {active.map((spec, index) => {
        const inkSeed = hashSeed(`stamp-ink-${spec.kind}-${spec.ownerId}`);
        const rotate = seededRange(seededRandom(hashSeed(`stamp-rotate-${spec.kind}-${spec.ownerId}`)), -12, 12);
        return (
          <div
            key={spec.kind}
            aria-hidden="true"
            // A slight overlap with the previous stamp, never a stack.
            className={index > 0 ? "-ml-3 size-24 md:-ml-4 md:size-32" : "size-24 md:size-32"}
            style={{ transform: `rotate(${rotate.toFixed(1)}deg)`, opacity: 0.8 }}
          >
            <BottleStamp kind={spec.kind} seed={inkSeed} detail={spec.detail} size={128} className="size-full" />
          </div>
        );
      })}
    </div>
  );
}
