import type { Route } from "next";
import Link from "next/link";
import { CharStave } from "@/components/char/char-stave";
import { Badge } from "@/components/ui/badge";
import { Inferred } from "@/components/ui/inferred";
import { MarginTag } from "@/components/ui/margin-tag";
import { CHAR_LEVEL_LABELS } from "@/db/schema";
import { CHAR_LEVEL_DETAILS, isCharLevel } from "@/lib/char-levels";
import { cn } from "@/lib/utils";

/**
 * How a label's specs and links read, on a bottle's page and on the label's
 * own: one spec as a small caption over its value, the linked distilleries
 * and finishes as chips, and mashbills as their recipes.
 */

/** Nothing renders for a value that isn't known. */
export function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "" || value === "—") return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-base">{value}</dd>
    </div>
  );
}

/**
 * Char Level gets its own full-width row under the spec grid: the stave with
 * this label's section marked, the value, and the one-liner. Like every other
 * spec, nothing renders when it isn't known.
 */
export function CharLevelSpec({ value }: { value: string | null }) {
  if (!isCharLevel(value)) return null;
  const detail = CHAR_LEVEL_DETAILS[value];
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">Char Level</span>
      <div className="flex flex-col gap-x-5 gap-y-2 sm:flex-row sm:items-center">
        <CharStave level={value} thickness={26} className="min-w-0 flex-1" />
        <div className="flex items-baseline gap-3">
          <span className="text-base">{CHAR_LEVEL_LABELS[value]}</span>
          {detail.flameShort ? <span className="text-sm tabular-nums text-muted-foreground">{detail.flameShort}</span> : null}
          {value === "4" ? <MarginTag seed={4}>alligator!</MarginTag> : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{detail.line}</p>
    </div>
  );
}

/**
 * Mashbills read as their recipe, not as a bare name, and on a blend each one
 * says whose it is (SPEC M7) — "78% Corn · 10% Rye · 12% Malted Barley" means
 * nothing on a three-distillery blend without knowing which distillery made
 * that part. On a single-distillery label the attribution is left off, because
 * there is only one possible answer.
 */
export function Mashbills({
  items,
}: {
  items: Array<{
    id: number;
    name: string;
    amount: string | null;
    recipe: string;
    attribution?: string;
    attributionSlug?: string | null;
  }>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">Mashbills</span>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
            <Link href={`/mashbills/${item.id}` as Route} className="font-medium hover:text-accent">
              {/* A generic style, or a secret one not yet inferred, has no recipe to show. */}
              {item.recipe || item.name}
            </Link>
            {item.amount !== null ? (
              <span className="text-muted-foreground">{Number(item.amount)}% of the blend</span>
            ) : null}
            {item.attribution ? (
              <span className="text-muted-foreground">
                from{" "}
                {item.attributionSlug ? (
                  <Link href={`/distilleries/${item.attributionSlug}` as Route} className="hover:text-accent">
                    {item.attribution}
                  </Link>
                ) : (
                  item.attribution
                )}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Chips({
  label,
  items,
  hrefFor,
}: {
  label: string;
  items: Array<{ id: number; name: string; slug: string | null; amount: string | null; inferred?: boolean }>;
  hrefFor: (item: { id: number; slug: string | null }) => Route | null;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const href = hrefFor(item);
          const chip = (
            <Badge
              className={cn(
                "border-border bg-muted text-foreground",
                item.inferred && "border-inferred/50 text-inferred",
                href && "transition-colors hover:border-primary/50 hover:text-primary",
              )}
            >
              {item.inferred ? <Inferred>{item.name}</Inferred> : item.name}
              {item.amount !== null ? (
                <span className="ml-1 text-muted-foreground">{Number(item.amount)}%</span>
              ) : null}
            </Badge>
          );
          return <li key={item.id}>{href ? <Link href={href}>{chip}</Link> : chip}</li>;
        })}
      </ul>
    </div>
  );
}
