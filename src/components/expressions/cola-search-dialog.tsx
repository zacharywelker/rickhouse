"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  addColaAction,
  attachColasAction,
  searchColasAction,
  type ColaSearchResult,
} from "@/app/(app)/expressions/cola-actions";
import { IDLE_RESULT, type ActionResult } from "@/lib/admin/types";
import { colaDetailUrl } from "@/lib/cola/ids";
import { registryCase, searchWindow } from "@/lib/cola/format";
import { cn, formatDate } from "@/lib/utils";

const MAX_PICK = 5;

/**
 * "Find on TTB" (SPEC M11): searches TTB's registry for this label's COLAs,
 * starting from its brand, and attaches the ones picked. Searching never
 * changes the label; only the attached COLAs are saved.
 */
export function ColaSearchDialog({
  expressionId,
  brandName,
  triggerLabel,
  onDone,
}: {
  expressionId: number;
  brandName: string;
  /** The text link that opens it: "Find on TTB", or a sentence in an empty state. */
  triggerLabel: string;
  onDone: (result: ActionResult) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(`${brandName.toUpperCase()}%`);
  const [field, setField] = React.useState<"brand" | "fanciful" | "either">("brand");
  const [span, setSpan] = React.useState(0);
  const [result, setResult] = React.useState<ColaSearchResult | null>(null);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [searching, startSearch] = React.useTransition();
  const [attaching, startAttach] = React.useTransition();

  const windows = React.useMemo(() => [0, 1].map((index) => searchWindow(index, new Date()).label), []);

  function search(event?: React.FormEvent) {
    event?.preventDefault();
    setPicked(new Set());
    startSearch(async () => setResult(await searchColasAction(expressionId, { name, field, window: span })));
  }

  function toggle(ttbId: string, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(ttbId);
      else next.delete(ttbId);
      return next;
    });
  }

  function attach() {
    startAttach(async () => {
      const outcome = await attachColasAction(expressionId, [...picked]);
      onDone(outcome);
      if (outcome.ok) {
        setOpen(false);
        setResult(null);
        setPicked(new Set());
      }
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Search as the dialog opens, from the label's brand.
        if (next && result === null) search();
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="text-sm text-primary hover:underline">
          {triggerLabel} &rarr;
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Find this label&rsquo;s approvals</DialogTitle>
          <DialogDescription>
            Searches TTB&rsquo;s public COLA registry. Pick the approvals that are this label: each proof, size or
            relabel has its own. Use % as a wildcard.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={search} className="flex flex-wrap items-end gap-3 border-b border-border px-6 py-4">
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            <Label htmlFor="cola-search-name">Name</Label>
            <Input id="cola-search-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cola-search-field">Search in</Label>
            <select
              id="cola-search-field"
              value={field}
              onChange={(e) => setField(e.target.value as typeof field)}
              className="h-10 border border-input bg-card px-3 text-sm"
            >
              <option value="brand">Brand name</option>
              <option value="fanciful">Fanciful name</option>
              <option value="either">Either</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cola-search-window">Approved</Label>
            <select
              id="cola-search-window"
              value={span}
              onChange={(e) => setSpan(Number(e.target.value))}
              className="h-10 border border-input bg-card px-3 text-sm"
            >
              {windows.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={searching}>
            {searching ? <Loader2 className="size-4 animate-spin" /> : null}
            Search
          </Button>
        </form>

        <div className="min-h-40 overflow-y-auto px-6 py-4">
          {searching ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Searching TTB&rsquo;s registry. It answers one page at a
              time, so this takes a few seconds.
            </p>
          ) : result === null ? null : !result.ok ? (
            <p role="alert" className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {result.error}
            </p>
          ) : result.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No spirits approvals matched between {result.window}. Try a shorter name, a % wildcard, the earlier
              window, or searching the fanciful name.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {result.rows.length} spirits approval{result.rows.length === 1 ? "" : "s"}, {result.window}
                {result.truncated ? ` — the first ${result.rows.length} of ${result.total}; narrow the name to see the rest` : ""}.
                Closest to this label&rsquo;s name first.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-8 py-2" />
                    <th className="py-2 pr-3 font-normal">Approved</th>
                    <th className="py-2 pr-3 font-normal">Brand / fanciful name</th>
                    <th className="py-2 pr-3 font-normal">Class / type</th>
                    <th className="py-2 pr-3 font-normal">Permit</th>
                    <th className="py-2 font-normal">TTB ID</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => {
                    const checked = row.attached || picked.has(row.ttbId);
                    const full = !checked && picked.size >= MAX_PICK;
                    return (
                      <tr key={row.ttbId} className={cn("border-b border-border/60", row.attached && "text-muted-foreground")}>
                        <td className="py-2 align-top">
                          <Checkbox
                            aria-label={`Add ${row.ttbId}`}
                            checked={checked}
                            disabled={row.attached || full}
                            onCheckedChange={(state) => toggle(row.ttbId, state === true)}
                          />
                        </td>
                        <td className="py-2 pr-3 align-top whitespace-nowrap">{formatDate(row.completedOn)}</td>
                        <td className="py-2 pr-3 align-top">
                          {row.brandName ? registryCase(row.brandName) : "—"}
                          {row.fancifulName ? (
                            <span className={cn(row.match > 0 && !row.attached && "text-accent")}>
                              {" "}
                              {registryCase(row.fancifulName)}
                            </span>
                          ) : null}
                          {row.attached ? <span className="block text-xs">Already on this label</span> : null}
                        </td>
                        <td className="py-2 pr-3 align-top">
                          {row.classType ? registryCase(row.classType) : "—"}
                          {row.origin ? <span className="block text-xs text-muted-foreground">{registryCase(row.origin)}</span> : null}
                        </td>
                        <td className="py-2 pr-3 align-top whitespace-nowrap">{row.permitNumber ?? "—"}</td>
                        <td className="py-2 align-top whitespace-nowrap">
                          <a
                            href={colaDetailUrl(row.ttbId)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            {row.ttbId}
                            <ExternalLink className="size-3" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter className="sm:items-center">
          <div className="sm:mr-auto">
            <AddById
              expressionId={expressionId}
              label="Have a TTB ID?"
              onDone={(outcome) => {
                onDone(outcome);
                if (outcome.ok) setOpen(false);
              }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {picked.size > 0 ? `${picked.size} picked` : `Pick up to ${MAX_PICK}`}
          </span>
          <Button type="button" onClick={attach} disabled={picked.size === 0 || attaching}>
            {attaching ? <Loader2 className="size-4 animate-spin" /> : null}
            {attaching ? "Fetching from TTB…" : "Add to label"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The fallback to searching: paste a TTB ID or a registry link. In the
 * search dialog's footer, or on its own when lookups are off.
 */
export function AddById({
  expressionId,
  label,
  onDone,
}: {
  expressionId: number;
  label: string;
  onDone: (result: ActionResult) => void;
}) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    addColaAction.bind(null, expressionId),
    IDLE_RESULT,
  );

  React.useEffect(() => {
    if (state === IDLE_RESULT) return;
    onDone(state);
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, onDone, router]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2">
      <Label htmlFor={`cola-ttb-id-${expressionId}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={`cola-ttb-id-${expressionId}`}
        name="ttbId"
        inputMode="numeric"
        autoComplete="off"
        placeholder="21132001000620"
        className="h-8 w-44 text-sm tabular-nums"
        aria-invalid={!state.ok && Boolean(state.fieldErrors?.ttbId)}
      />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
        Add
      </Button>
    </form>
  );
}
