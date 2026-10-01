"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatMoney } from "@/lib/utils";

export type HaulBottle = { id: number; title: string; price: number };

/**
 * The haul so far: how many bottles and what they cost, each a link, and a
 * way to keep them together as a Group. Lives inside the add-bottle form, so
 * its own controls are plain buttons and Enter in the name makes the group
 * rather than saving a bottle.
 */
export function HaulPanel({
  haul,
  notice,
  group,
  defaultName,
  onMakeGroup,
  finished,
}: {
  haul: HaulBottle[];
  notice: string | null;
  group: { id: number; name: string } | null;
  /** What the group is called unless changed: the haul's store and date. */
  defaultName: string;
  /** Resolves to an error message, or null once the group exists. */
  onMakeGroup: (name: string) => Promise<string | null>;
  finished: boolean;
}) {
  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState(defaultName);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const spend = haul.reduce((sum, bottle) => sum + bottle.price, 0);
  const nameId = React.useId();

  const startNaming = () => {
    setName(defaultName);
    setError(null);
    setNaming(true);
  };

  const make = async () => {
    if (pending) return;
    setPending(true);
    const problem = await onMakeGroup(name);
    setPending(false);
    setError(problem);
    if (problem === null) setNaming(false);
  };

  return (
    <div className={cn("flex flex-col gap-2 border-l-2 border-accent pl-3 text-sm", finished && "py-1")} aria-live="polite">
      {finished ? <h2 className="text-2xl leading-tight tracking-tight">That&rsquo;s the haul.</h2> : null}
      <p>
        <span className="font-medium">
          {finished ? "" : "This haul: "}
          {haul.length} {haul.length === 1 ? "bottle" : "bottles"}
        </span>
        {spend > 0 ? <span className="text-muted-foreground"> · {formatMoney(String(spend))}</span> : null}
      </p>
      <p className="text-muted-foreground">
        {haul.map((bottle, i) => (
          <React.Fragment key={bottle.id}>
            {i > 0 ? " · " : null}
            <Link href={`/bottles/${bottle.id}`} className="hover:text-accent hover:underline">
              {bottle.title}
            </Link>
          </React.Fragment>
        ))}
      </p>
      {notice ? <p className="text-muted-foreground">{notice}</p> : null}

      {group ? (
        <p>
          In the group{" "}
          <Link href={`/groups/${group.id}`} className="font-medium text-primary underline underline-offset-2 hover:no-underline">
            {group.name}
          </Link>
          {finished ? "." : ". Bottles you add from here go in it too."}
        </p>
      ) : naming ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="text-xs uppercase tracking-wide text-muted-foreground">
            Group name
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              id={nameId}
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void make();
                } else if (event.key === "Escape") {
                  setNaming(false);
                }
              }}
              aria-invalid={error ? true : undefined}
              className={cn("max-w-sm", error && "border-destructive")}
            />
            <Button type="button" onClick={() => void make()} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Make the group
            </Button>
            <Button type="button" variant="outline" onClick={() => setNaming(false)}>
              Not now
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={startNaming}>
            Make this haul a group
          </Button>
        </div>
      )}
    </div>
  );
}
