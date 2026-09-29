"use client";

import * as React from "react";
import { useActionState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowUpToLine, ExternalLink, ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addColaAction,
  copyColaImageToBottleAction,
  featureColaAction,
  refreshColaAction,
  removeColaAction,
} from "@/app/(app)/expressions/cola-actions";
import { IDLE_RESULT, type ActionResult } from "@/lib/admin/types";
import { colaDetailUrl, colaFormUrl } from "@/lib/cola/ids";
import { registryCase } from "@/lib/cola/format";
import { cn, formatDate } from "@/lib/utils";
import { ColaSearchDialog } from "./cola-search-dialog";

export type ColaImageView = {
  id: number;
  filePath: string;
  thumbPath: string | null;
  displayPath: string | null;
  panel: string | null;
  width: number | null;
  height: number | null;
};

export type ColaView = {
  id: number;
  ttbId: string;
  status: string | null;
  brandName: string | null;
  fancifulName: string | null;
  classTypeCode: string | null;
  classType: string | null;
  origin: string | null;
  isImported: boolean | null;
  applicantName: string | null;
  applicantAddress: string | null;
  permitNumber: string | null;
  approvedOn: string | null;
  fetchedAt: Date | null;
  fetchError: string | null;
  images: ColaImageView[];
};

type Props = {
  colas: ColaView[];
  lookupEnabled: boolean;
  /** The owner's distilleries whose DSP number matches a COLA's permit, keyed by that permit. */
  distilleryMatches: Record<string, { name: string; slug: string }>;
} & ({ mode: "label"; expressionId: number; brandName: string } | { mode: "bottle"; bottleId: number });

/**
 * A label's TTB approvals (SPEC M11). They add to a label rather than define
 * it: the approved label art, and what the approval says about who bottled
 * it and where. The first is featured; the rest are one line each.
 *
 * On the label's page ("label") they are found on TTB, added, refreshed,
 * reordered and removed. On a bottle's page ("bottle") they are shown, and a
 * label panel can be copied into the bottle's photos.
 */
export function ColaApprovals(props: Props) {
  const { colas, lookupEnabled, distilleryMatches } = props;
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<ActionResult>(IDLE_RESULT);

  const run = React.useCallback(
    (key: string, action: () => Promise<ActionResult>) => {
      setBusyKey(key);
      startTransition(async () => {
        setNotice(await action());
        setBusyKey(null);
        router.refresh();
      });
    },
    [router],
  );

  if (props.mode === "bottle" && colas.length === 0) return null;
  const [featured, ...others] = colas;

  const actionsFor = (cola: ColaView, isFeatured: boolean): Actions => ({
    busyKey,
    pending,
    lookupEnabled,
    ...(props.mode === "label"
      ? {
          onRefresh: () => run(`refresh-${cola.id}`, () => refreshColaAction(cola.id)),
          onRemove: () => run(`remove-${cola.id}`, () => removeColaAction(cola.id)),
          ...(isFeatured ? {} : { onFeature: () => run(`feature-${cola.id}`, () => featureColaAction(cola.id)) }),
        }
      : {
          onUsePanel: (imageId: number) =>
            run(`photo-${imageId}`, () => copyColaImageToBottleAction(imageId, props.bottleId)),
        }),
  });

  return (
    <div className="flex flex-col gap-4">
      {props.mode === "label" ? (
        <div className="flex flex-wrap items-end gap-2">
          {lookupEnabled ? (
            <ColaSearchDialog expressionId={props.expressionId} brandName={props.brandName} onDone={setNotice} />
          ) : null}
          <AddById expressionId={props.expressionId} lookupEnabled={lookupEnabled} onDone={setNotice} />
        </div>
      ) : null}

      <Notice result={notice} />

      {featured === undefined ? (
        <p className="text-sm text-muted-foreground">
          No label approvals yet.{" "}
          {lookupEnabled
            ? "Find this label on TTB to add its approved label art and who bottled it."
            : "Paste a TTB ID to link this label to its record on TTB."}
        </p>
      ) : (
        <>
          <ColaCard cola={featured} match={matchFor(featured, distilleryMatches)} actions={actionsFor(featured, true)} />
          {others.length > 0 ? (
            <ul className="flex flex-col border-t border-border">
              {others.map((cola) => (
                <li key={cola.id} className="border-b border-border">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 py-2.5 text-sm hover:text-accent">
                      <span className="text-muted-foreground transition-transform group-open:rotate-90">▸</span>
                      <span className="font-medium">{summaryName(cola)}</span>
                      <span className="text-muted-foreground">
                        {[cola.approvedOn ? formatDate(cola.approvedOn) : null, cola.applicantName, cola.ttbId]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </summary>
                    <div className="pb-4 pt-2">
                      <ColaCard cola={cola} match={matchFor(cola, distilleryMatches)} actions={actionsFor(cola, false)} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}

type Actions = {
  busyKey: string | null;
  pending: boolean;
  lookupEnabled: boolean;
  onRefresh?: () => void;
  onRemove?: () => void;
  onFeature?: () => void;
  onUsePanel?: (imageId: number) => void;
};

function matchFor(cola: ColaView, matches: Props["distilleryMatches"]) {
  return cola.permitNumber ? (matches[cola.permitNumber] ?? null) : null;
}

function summaryName(cola: ColaView): string {
  const brand = cola.brandName ? registryCase(cola.brandName) : `TTB ID ${cola.ttbId}`;
  return cola.fancifulName ? `${brand} ${registryCase(cola.fancifulName)}` : brand;
}

/** The front label if there is one: TTB calls it "Brand (front) or keg collar". */
function frontIndex(images: ColaImageView[]): number {
  const index = images.findIndex((image) => /^brand\b/i.test(image.panel ?? ""));
  return index === -1 ? 0 : index;
}

function Spinner({ on, icon }: { on: boolean; icon: React.ReactNode }) {
  return on ? <Loader2 className="size-3.5 animate-spin" /> : <>{icon}</>;
}

function ColaCard({
  cola,
  match,
  actions,
}: {
  cola: ColaView;
  match: { name: string; slug: string } | null;
  actions: Actions;
}) {
  const [shown, setShown] = React.useState(() => frontIndex(cola.images));
  const image = cola.images[shown] ?? cola.images[0];
  const busy = (key: string) => actions.busyKey === key;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,26rem)_1fr]">
      <div className="flex flex-col gap-3">
        {image ? (
          <>
            {/* The full file is the scan at TTB's own resolution; the page shows a 1200px rendition. */}
            <a
              href={`/api/images/${image.filePath}`}
              target="_blank"
              rel="noreferrer"
              title="Open the full-resolution label"
              className="flex items-center justify-center border border-border bg-muted/40 p-3"
            >
              <Image
                src={`/api/images/${image.displayPath ?? image.filePath}`}
                alt={`${image.panel ?? "Label"}, ${summaryName(cola)}`}
                width={image.width ?? 1200}
                height={image.height ?? 800}
                unoptimized
                className="max-h-[26rem] w-auto object-contain"
              />
            </a>
            <div className="flex flex-wrap items-end gap-2">
              {cola.images.map((panel, index) => (
                <div key={panel.id} className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setShown(index)}
                    aria-pressed={index === shown}
                    aria-label={`Show ${panel.panel ?? "label"}`}
                    className={cn(
                      "flex h-16 items-center border p-1",
                      index === shown ? "border-foreground" : "border-border opacity-70 hover:opacity-100",
                    )}
                  >
                    <Image
                      src={`/api/images/${panel.thumbPath ?? panel.filePath}`}
                      alt=""
                      width={96}
                      height={56}
                      unoptimized
                      className="h-full w-auto object-contain"
                    />
                  </button>
                  {actions.onUsePanel ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-1.5"
                      disabled={actions.pending}
                      title={`Add the ${panel.panel ?? "label"} to this bottle's photos`}
                      onClick={() => actions.onUsePanel!(panel.id)}
                    >
                      <Spinner on={busy(`photo-${panel.id}`)} icon={<ImagePlus className="size-3.5" />} />
                      Use
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {image.panel ?? "Label"}
              {image.width && image.height ? ` · ${image.width}×${image.height}px` : ""} · click to open full size
            </p>
          </>
        ) : (
          <div className="flex min-h-40 items-center justify-center border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {cola.fetchedAt
              ? "TTB has no label images for this approval."
              : actions.lookupEnabled
                ? "Not fetched yet."
                : "Lookups are off on this server; the record is on TTB."}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-lg leading-tight">{summaryName(cola)}</p>
            <p className="text-sm text-muted-foreground">
              {cola.approvedOn ? `Approved ${formatDate(cola.approvedOn)}` : "Label approval"}
              {cola.status && cola.status !== "APPROVED" ? ` · ${registryCase(cola.status)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {actions.onFeature ? (
              <Button variant="outline" size="sm" disabled={actions.pending} onClick={actions.onFeature}>
                <Spinner on={busy(`feature-${cola.id}`)} icon={<ArrowUpToLine className="size-3.5" />} />
                Show first
              </Button>
            ) : null}
            {actions.onRefresh && actions.lookupEnabled ? (
              <Button variant="outline" size="sm" disabled={actions.pending} onClick={actions.onRefresh}>
                <Spinner on={busy(`refresh-${cola.id}`)} icon={<RefreshCw className="size-3.5" />} />
                {cola.fetchedAt ? "Refresh" : "Fetch"}
              </Button>
            ) : null}
            {actions.onRemove ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={actions.pending}
                aria-label={`Remove ${cola.ttbId}`}
                onClick={actions.onRemove}
              >
                <Spinner on={busy(`remove-${cola.id}`)} icon={<Trash2 className="size-3.5" />} />
              </Button>
            ) : null}
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Fact label="TTB ID">
            <a
              href={colaDetailUrl(cola.ttbId)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {cola.ttbId}
              <ExternalLink className="size-3" />
            </a>
            <a
              href={colaFormUrl(cola.ttbId)}
              target="_blank"
              rel="noreferrer"
              className="block text-xs text-muted-foreground hover:text-primary hover:underline"
            >
              Printable application
            </a>
          </Fact>
          <Fact label="Class / type">
            {cola.classType ? registryCase(cola.classType) : null}
            {cola.classTypeCode ? <span className="text-muted-foreground"> ({cola.classTypeCode})</span> : null}
          </Fact>
          <Fact label="Origin">
            {cola.origin ? registryCase(cola.origin) : null}
            {cola.isImported !== null ? (
              <span className="text-muted-foreground"> · {cola.isImported ? "imported" : "domestic"}</span>
            ) : null}
          </Fact>
          <Fact label={cola.isImported ? "Importer" : "Bottler"}>
            {cola.applicantName}
            {cola.permitNumber ? <span className="block font-mono text-xs">{cola.permitNumber}</span> : null}
            {cola.applicantAddress ? (
              <span className="block text-xs text-muted-foreground">{cola.applicantAddress}</span>
            ) : null}
            {match ? (
              <span className="block text-xs">
                Your distillery:{" "}
                <Link href={`/distilleries/${match.slug}` as Route} className="text-primary hover:underline">
                  {match.name}
                </Link>
              </span>
            ) : null}
          </Fact>
        </dl>
        {cola.applicantName ? (
          <p className="text-xs text-muted-foreground">
            The {cola.isImported ? "importer" : "bottler"} is the permit holder that filed this label, which is not
            always who distilled what is in the bottle.
          </p>
        ) : null}

        {cola.fetchError ? <p className="text-sm text-destructive">{cola.fetchError}</p> : null}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd>{children || "—"}</dd>
    </div>
  );
}

function Notice({ result }: { result: ActionResult }) {
  if (result.ok && !result.message) return null;
  return (
    <p
      role={result.ok ? "status" : "alert"}
      className={cn(
        "px-3 py-2 text-sm",
        result.ok ? "border border-border bg-muted" : "border border-destructive/40 bg-destructive/10 text-destructive",
      )}
    >
      {result.ok ? result.message : result.error}
    </p>
  );
}

/** The fallback to searching: paste a TTB ID or a registry link. */
function AddById({
  expressionId,
  lookupEnabled,
  onDone,
}: {
  expressionId: number;
  lookupEnabled: boolean;
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
    <form ref={formRef} action={formAction} className="flex flex-wrap gap-2">
      <Input
        name="ttbId"
        aria-label="TTB ID"
        inputMode="numeric"
        autoComplete="off"
        placeholder={lookupEnabled ? "Or paste a TTB ID or registry link" : "Paste a TTB ID or registry link"}
        className="w-72"
        aria-invalid={!state.ok && Boolean(state.fieldErrors?.ttbId)}
      />
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Add
      </Button>
    </form>
  );
}
