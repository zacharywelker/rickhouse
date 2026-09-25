import { hashSeed, seededRandom, seededRange } from "@/lib/seeded-random";

/**
 * A designation printed like a customs stamp pressed onto the page itself
 * — outline ink in the bottle's own category color, worn rather than a
 * clean vector: broken dashes where the rubber didn't quite seat, a soft
 * directional fade for uneven hand pressure, and one or two blots where
 * the pad ran dry. Replaces the plain-text "Bottled in Bond" / "Straight"
 * badges; see the Issue #65 mockup this was built from.
 *
 * Every random-looking property comes from `seed`, never `Math.random()` —
 * a stamp is a property of *this bottle's page* (like Polaroid's tilt and
 * Tape's `randomLook()` comment both note), so it looks the same on every
 * visit and only moves if the seed itself changes.
 */
export type StampKind = "bottled-in-bond" | "straight";

/** A handful of hand-tunable dash/gap lengths, drawn from the seed so no two stamps break in the same places. */
function distressDashes(rng: () => number, segments: number): string {
  const parts: number[] = [];
  for (let i = 0; i < segments; i++) {
    parts.push(seededRange(rng, 9, 30)); // ink
    parts.push(seededRange(rng, 2, 5.5)); // skip
  }
  return parts.map((n) => n.toFixed(1)).join(" ");
}

function StampDefs({
  id,
  rng,
}: {
  id: string;
  rng: () => number;
}) {
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
  // How far the fade dims the far side — a light press stays close to full
  // opacity everywhere, a heavy-wear roll goes considerably dimmer.
  const floor = Math.round(seededRange(rng, 55, 80));

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
        <stop offset="1" stopColor={`hsl(0 0% ${Math.max(30, floor - 20)}%)`} />
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
          fill="var(--color-paper)"
          transform={`rotate(${p.rotate} ${p.cx} ${p.cy})`}
        />
      ))}
    </g>
  );
}

function BottledInBondMark({ id, color, rng }: { id: string; color: string; rng: () => number }) {
  return (
    <>
      <StampDefs id={id} rng={rng} />
      <g mask={`url(#${id}-mask)`} filter={`url(#${id}-soft)`}>
        <circle cx="80" cy="80" r="74" fill="none" stroke={color} strokeWidth="2.5" strokeDasharray={distressDashes(rng, 5)} />
        <path id={`${id}-top`} d="M 80,80 m -56,0 a 56,56 0 1,1 112,0" fill="none" />
        <path id={`${id}-bot`} d="M 80,80 m -56,0 a 56,56 0 1,0 112,0" fill="none" />
        <text fill={color} fontSize="13" fontWeight="700" letterSpacing="1.2">
          <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">
            U.S. TREASURY
          </textPath>
        </text>
        <text fill={color} fontSize="13" fontWeight="700" letterSpacing="1.2">
          <textPath href={`#${id}-bot`} startOffset="50%" textAnchor="middle">
            DISTILLERY NO. 12
          </textPath>
        </text>
        <text x="80" y="80" textAnchor="middle" fill={color} fontSize="16" fontWeight="700" fontFamily="Georgia, 'Times New Roman', serif">
          BOTTLED
        </text>
        <text x="80" y="98" textAnchor="middle" fill={color} fontSize="16" fontWeight="700" fontFamily="Georgia, 'Times New Roman', serif">
          IN BOND
        </text>
        <text x="80" y="114" textAnchor="middle" fill={color} fontSize="8.5" letterSpacing="1.5">
          100 PROOF
        </text>
      </g>
      <DryPatches id={id} rng={rng} />
    </>
  );
}

function StraightMark({ id, color, rng }: { id: string; color: string; rng: () => number }) {
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
          AT LEAST 2 YEARS
        </text>
        <text
          x="80"
          y="84"
          textAnchor="middle"
          fill={color}
          fontSize="20"
          fontWeight="700"
          letterSpacing="1"
          fontFamily="Georgia, 'Times New Roman', serif"
        >
          STRAIGHT
        </text>
        <text x="80" y="106" textAnchor="middle" fill={color} fontSize="9" fontWeight="700" letterSpacing="2">
          ADDITIVE FREE
        </text>
      </g>
      <DryPatches id={id} rng={rng} />
    </>
  );
}

/** The graphic alone, unpositioned — `size` is the rendered square in px. */
export function BottleStamp({
  kind,
  seed,
  color,
  size = 200,
  className,
}: {
  kind: StampKind;
  seed: number;
  color: string;
  size?: number;
  className?: string;
}) {
  const id = `stamp-${kind}-${seed}`;
  const rng = seededRandom(seed);
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} className={className} aria-hidden="true">
      {kind === "bottled-in-bond" ? (
        <BottledInBondMark id={id} color={color} rng={rng} />
      ) : (
        <StraightMark id={id} color={color} rng={rng} />
      )}
    </svg>
  );
}

const STAMP_BASE_SIZE = 210;

/**
 * The decorative layer for a bottle page: one stamp per true designation
 * flag, scattered into the page's empty space at a seeded angle and
 * position, always behind the page's real content (the caller stacks this
 * as an absolutely-positioned `-z-10` sibling — see bottles/[id]/page.tsx).
 * Placement is keyed off the expression id and which flag it is, so it's
 * stable across refreshes and only reshuffles if that expression's own
 * designations change (a new one added, an old one cleared).
 */
export function BottleStamps({
  expressionId,
  color,
  isBottledInBond,
  isStraight,
}: {
  expressionId: number;
  color: string;
  isBottledInBond?: boolean;
  isStraight?: boolean;
}) {
  const active: StampKind[] = [
    ...(isBottledInBond ? (["bottled-in-bond"] as const) : []),
    ...(isStraight ? (["straight"] as const) : []),
  ];
  if (active.length === 0) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {active.map((kind, index) => {
        const placeSeed = hashSeed(`stamp-place-${kind}-${expressionId}`);
        const rng = seededRandom(placeSeed);
        // Two stamps on one page are seeded to opposite halves so they
        // don't land on top of each other; a lone stamp just roams free.
        const left =
          active.length > 1
            ? index === 0
              ? seededRange(rng, 6, 40)
              : seededRange(rng, 60, 94)
            : seededRange(rng, 10, 90);
        const top = seededRange(rng, 8, 78);
        const rotate = seededRange(rng, -18, 18);
        const scale = seededRange(rng, 0.85, 1.3);
        const inkSeed = hashSeed(`stamp-ink-${kind}-${expressionId}`);
        return (
          <div
            key={kind}
            className="absolute"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              transform: `translate(-50%, -50%) rotate(${rotate.toFixed(1)}deg)`,
              opacity: 0.4,
            }}
          >
            <BottleStamp kind={kind} seed={inkSeed} color={color} size={Math.round(STAMP_BASE_SIZE * scale)} />
          </div>
        );
      })}
    </div>
  );
}
