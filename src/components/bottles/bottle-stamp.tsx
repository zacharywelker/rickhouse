import type { ReactNode } from "react";
import { hashSeed, seededRandom, seededRange } from "@/lib/seeded-random";

/**
 * A designation printed like a customs stamp pressed onto the page itself
 * — outline ink in the bottle's own category color, worn rather than a
 * clean vector: broken dashes where the rubber didn't quite seat, a soft
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

/** A ledger-box stamp: a top line, one big center word, a bottom line. Straight, NAS, Private Selection. */
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
        <text x="80" y="106" textAnchor="middle" fill={color} fontSize="9" fontWeight="700" letterSpacing="2">
          {bottomText}
        </text>
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

/** The graphic alone, unpositioned — `size` is the rendered square in px. `detail` overrides the piece of the design that carries real per-bottle data (a proof, a barrel number, a picker's name). */
export function BottleStamp({
  kind,
  seed,
  color,
  detail,
  size = 200,
  className,
}: {
  kind: StampKind;
  seed: number;
  color: string;
  /** Real per-bottle data shown in place of the stamp's generic center/caption text, where it has one (proof for Cask Strength, barrel number for Single Barrel, picker for Private Selection). */
  detail?: string;
  size?: number;
  className?: string;
}) {
  const id = `stamp-${kind}-${seed}`;
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

const STAMP_BASE_SIZE = 210;

/** One designation flag, and who it belongs to (an expression id for a label-level fact, a bottle id for a per-copy one) — placement and ink are both seeded off that owner so a fact shared by every bottle of an expression prints identically on each of their pages. */
export interface StampSpec {
  kind: StampKind;
  ownerId: number;
  active: boolean;
  detail?: string;
}

// A loose, hand-spread grid of anchor points covering the page, rather than
// a tidy rows-and-columns layout — enough slots that six designations at
// once still don't crowd the same corner.
const SLOTS: Array<{ left: number; top: number }> = [
  { left: 14, top: 12 },
  { left: 50, top: 8 },
  { left: 88, top: 16 },
  { left: 10, top: 46 },
  { left: 90, top: 50 },
  { left: 16, top: 80 },
  { left: 52, top: 88 },
  { left: 86, top: 82 },
];

// Fixed so slot assignment never depends on the order callers happen to
// list flags in — only on which ones are active.
const KIND_ORDER: StampKind[] = ["bottled-in-bond", "cask-strength", "straight", "nas", "single-barrel", "private-selection"];

/**
 * The decorative layer for a bottle page: one stamp per true designation,
 * scattered into the page's empty space at a seeded angle and position,
 * always behind the page's real content (the caller stacks this as an
 * absolutely-positioned `-z-10` sibling — see bottles/[id]/page.tsx).
 * Each stamp's slot is picked from its own identity (kind + owner id) with
 * a deterministic collision scan, so adding or removing one designation
 * never reshuffles where the others already landed.
 */
export function BottleStamps({ color, stamps }: { color: string; stamps: StampSpec[] }) {
  const active = KIND_ORDER.map((kind) => stamps.find((s) => s.kind === kind && s.active)).filter(
    (s): s is StampSpec => s !== undefined,
  );
  if (active.length === 0) return null;

  const taken = new Set<number>();

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {active.map((spec) => {
        const placeKey = `stamp-place-${spec.kind}-${spec.ownerId}`;
        let slotIndex = hashSeed(placeKey) % SLOTS.length;
        while (taken.has(slotIndex)) slotIndex = (slotIndex + 1) % SLOTS.length;
        taken.add(slotIndex);
        const slot = SLOTS[slotIndex]!;

        const placeRng = seededRandom(hashSeed(`${placeKey}-jitter`));
        const left = slot.left + seededRange(placeRng, -5, 5);
        const top = slot.top + seededRange(placeRng, -5, 5);
        const rotate = seededRange(placeRng, -18, 18);
        const scale = seededRange(placeRng, 0.8, 1.2);

        const inkSeed = hashSeed(`stamp-ink-${spec.kind}-${spec.ownerId}`);
        return (
          <div
            key={spec.kind}
            className="absolute"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              transform: `translate(-50%, -50%) rotate(${rotate.toFixed(1)}deg)`,
              opacity: 0.55,
            }}
          >
            <BottleStamp kind={spec.kind} seed={inkSeed} color={color} detail={spec.detail} size={Math.round(STAMP_BASE_SIZE * scale)} />
          </div>
        );
      })}
    </div>
  );
}
