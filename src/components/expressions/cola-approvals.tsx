"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  copyColaImageToBottleAction,
  featureColaAction,
  refreshColaAction,
  removeColaAction,
} from "@/app/(app)/expressions/cola-actions";
import { IDLE_RESULT, type ActionResult } from "@/lib/admin/types";
import { colaDetailUrl, colaFormUrl } from "@/lib/cola/ids";
import { registryCase } from "@/lib/cola/format";
import { cn, formatDate } from "@/lib/utils";
import { AddById, ColaSearchDialog } from "./cola-search-dialog";

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
  className?: string;
} & ({ mode: "label"; expressionId: number; brandName: string } | { mode: "bottle"; bottleId: number });

const KEY = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const TEXT_LINK = "text-primary hover:underline disabled:opacity-50";

/**
 * A label's TTB approvals (SPEC M11), set like a specimen record: the
 * approved label art on the page, a ruled record of what the approval says
 * beside it, and any other approvals as a short table. They add to a label
 * rather than define it, so on the label's page they sit below the form.
 *
 * On the label's page ("label") they are found on TTB, added, refreshed,
 * reordered and removed. On a bottle's page ("bottle") they are shown, and a
 * label panel can be copied into the bottle's photos.
 */
export function ColaApprovals(props: Props) {
  const { colas, lookupEnabled, distilleryMatches, className } = props;
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
  const labelMode = props.mode === "label" ? props : null;

  const findOnTtb = (triggerLabel: string) =>
    labelMode && lookupEnabled ? (
      <ColaSearchDialog
        expressionId={labelMode.expressionId}
        brandName={labelMode.brandName}
        triggerLabel={triggerLabel}
        onDone={setNotice}
      />
    ) : null;

  return (
    <section className={cn("flex flex-col gap-5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-xl leading-tight tracking-tight">Label approvals</h2>
          {labelMode ? (
            <p className="text-sm text-muted-foreground">
              TTB&rsquo;s certificates of label approval, one per proof, size or relabel. Saved as you add them.
            </p>
          ) : null}
        </div>
        {featured ? findOnTtb("Find on TTB") : null}
        {labelMode && !lookupEnabled ? (
          <AddById expressionId={labelMode.expressionId} label="TTB ID" onDone={setNotice} />
        ) : null}
      </div>

      {notice.ok && !notice.message ? null : (
        <p role={notice.ok ? "status" : "alert"} className={cn("text-sm", notice.ok ? "text-muted-foreground" : "text-destructive")}>
          {notice.ok ? notice.message : notice.error}
        </p>
      )}

      {featured === undefined ? (
        <p className="text-sm text-muted-foreground">
          No approvals yet. {lookupEnabled ? findOnTtb("Find this label on TTB") : "Paste its TTB ID to link it to TTB’s record."}
        </p>
      ) : (
        <>
          <Specimen
            // A new featured approval starts on its own front label.
            key={featured.id}
            cola={featured}
            match={featured.permitNumber ? (distilleryMatches[featured.permitNumber] ?? null) : null}
            busyKey={busyKey}
            pending={pending}
            onRefresh={labelMode && lookupEnabled ? () => run("refresh", () => refreshColaAction(featured.id)) : undefined}
            onRemove={labelMode ? () => run("remove", () => removeColaAction(featured.id)) : undefined}
            onUsePanel={
              props.mode === "bottle"
                ? (imageId) => run(`photo-${imageId}`, () => copyColaImageToBottleAction(imageId, props.bottleId))
                : undefined
            }
          />

          {others.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <h3 className={KEY}>Other approvals</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn("border-b border-foreground text-left", KEY)}>
                    <th className="py-1.5 pr-4 font-semibold">Approved</th>
                    <th className="py-1.5 pr-4 font-semibold">Name</th>
                    <th className="hidden py-1.5 pr-4 font-semibold sm:table-cell">Class</th>
                    <th className="hidden py-1.5 pr-4 font-semibold sm:table-cell">Permit</th>
                    <th className="py-1.5 pr-4 font-semibold">TTB ID</th>
                    {labelMode ? <th className="py-1.5" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {others.map((cola) => (
                    <tr key={cola.id} className="border-b border-border">
                      <td className="whitespace-nowrap py-1.5 pr-4 tabular-nums">{formatDate(cola.approvedOn)}</td>
                      <td className="py-1.5 pr-4">{cola.fancifulName ? registryCase(cola.fancifulName) : "—"}</td>
                      <td className="hidden py-1.5 pr-4 sm:table-cell">
                        {cola.classType ? registryCase(cola.classType) : "—"}
                      </td>
                      <td className="hidden whitespace-nowrap py-1.5 pr-4 tabular-nums sm:table-cell">
                        {cola.permitNumber ?? "—"}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-4 tabular-nums">
                        <a href={colaDetailUrl(cola.ttbId)} target="_blank" rel="noreferrer" className={TEXT_LINK}>
                          {cola.ttbId}&nbsp;↗
                        </a>
                      </td>
                      {labelMode ? (
                        <td className="whitespace-nowrap py-1.5 text-right">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(`feature-${cola.id}`, () => featureColaAction(cola.id))}
                            className={cn("text-xs", TEXT_LINK)}
                          >
                            {busyKey === `feature-${cola.id}` ? "Moving…" : "Show first"}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/** The front label if there is one: TTB calls it "Brand (front) or keg collar". */
function frontIndex(images: ColaImageView[]): number {
  const index = images.findIndex((image) => /^brand\b/i.test(image.panel ?? ""));
  return index === -1 ? 0 : index;
}

/** "Brand (front) or keg collar" → "Front"; everything else as TTB names it. */
function panelName(panel: string | null): string {
  if (!panel) return "Label";
  if (/^brand\b/i.test(panel)) return "Front";
  return panel;
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 border-b border-border py-1.5">
      <dt className={cn(KEY, "pt-0.5")}>{label}</dt>
      <dd className="min-w-0">{children || "—"}</dd>
    </div>
  );
}

function Specimen({
  cola,
  match,
  busyKey,
  pending,
  onRefresh,
  onRemove,
  onUsePanel,
}: {
  cola: ColaView;
  match: { name: string; slug: string } | null;
  busyKey: string | null;
  pending: boolean;
  onRefresh?: () => void;
  onRemove?: () => void;
  onUsePanel?: (imageId: number) => void;
}) {
  const [shown, setShown] = React.useState(() => frontIndex(cola.images));
  const image = cola.images[shown] ?? cola.images[0];
  const party = cola.isImported ? "Importer" : "Bottler";

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,22rem)_1fr] md:gap-8">
      <figure className="m-0 flex flex-col gap-2">
        {image ? (
          <>
            {/* On the page like a catalog shot, not in a frame (DESIGN.md §9). The page gets a 1200px rendition; the link opens the scan. */}
            <a href={`/api/images/${image.filePath}`} target="_blank" rel="noreferrer" title="Open the full-size scan">
              <Image
                src={`/api/images/${image.displayPath ?? image.filePath}`}
                alt={`${panelName(image.panel)} label, TTB ID ${cola.ttbId}`}
                width={image.width ?? 1200}
                height={image.height ?? 800}
                unoptimized
                className="h-52 w-auto max-w-full object-contain object-left"
              />
            </a>
            <figcaption className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              <span className="flex flex-wrap gap-x-1.5">
                {cola.images.map((panel, index) => (
                  <React.Fragment key={panel.id}>
                    {index > 0 ? <span aria-hidden>·</span> : null}
                    <button
                      type="button"
                      onClick={() => setShown(index)}
                      aria-pressed={index === shown}
                      className={cn(index === shown ? "font-medium text-foreground" : "hover:text-foreground")}
                    >
                      {panelName(panel.panel)}
                    </button>
                  </React.Fragment>
                ))}
              </span>
              <span className="tabular-nums">
                {image.width && image.height ? `${image.width} × ${image.height} · ` : ""}
                <a href={`/api/images/${image.filePath}`} target="_blank" rel="noreferrer" className={TEXT_LINK}>
                  full size ↗
                </a>
              </span>
              {onUsePanel ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onUsePanel(image.id)}
                  className={cn("self-start", TEXT_LINK)}
                >
                  {busyKey === `photo-${image.id}`
                    ? "Adding…"
                    : `Add ${panelName(image.panel).toLowerCase()} label to photos`}
                </button>
              ) : null}
            </figcaption>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {cola.fetchedAt ? "TTB has no label art for this approval." : "Label art not fetched yet."}
          </p>
        )}
      </figure>

      <div className="flex flex-col gap-2">
        <dl className="m-0 border-t-2 border-foreground text-sm">
          <Row label="TTB ID">
            <a href={colaDetailUrl(cola.ttbId)} target="_blank" rel="noreferrer" className={cn("tabular-nums", TEXT_LINK)}>
              {cola.ttbId}&nbsp;↗
            </a>
          </Row>
          <Row label="Approved">
            {cola.approvedOn ? <span className="tabular-nums">{formatDate(cola.approvedOn)}</span> : null}
            {cola.status && cola.status !== "APPROVED" ? (
              <span className="text-destructive"> · {registryCase(cola.status)}</span>
            ) : null}
          </Row>
          <Row label="Name">
            {[cola.brandName, cola.fancifulName].filter(Boolean).map((part) => registryCase(part!)).join(" ")}
          </Row>
          <Row label="Class">
            {cola.classType ? registryCase(cola.classType) : null}
            {cola.classTypeCode ? <span className="tabular-nums text-muted-foreground"> · {cola.classTypeCode}</span> : null}
          </Row>
          <Row label="Origin">
            {cola.origin ? registryCase(cola.origin) : null}
            {cola.isImported !== null ? (
              <span className="text-muted-foreground"> · {cola.isImported ? "imported" : "domestic"}</span>
            ) : null}
          </Row>
          <Row label={cola.applicantName ? `${party}*` : party}>
            {cola.applicantName ? (
              <>
                {cola.applicantName}
                <span className="block text-xs text-muted-foreground">
                  {[cola.permitNumber, cola.applicantAddress].filter(Boolean).join(" · ")}
                </span>
                {match ? (
                  <span className="block text-xs">
                    Your distillery:{" "}
                    <Link href={`/distilleries/${match.slug}` as Route} className={TEXT_LINK}>
                      {match.name}
                    </Link>
                  </span>
                ) : null}
              </>
            ) : null}
          </Row>
        </dl>

        <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          {onRefresh ? (
            <>
              <button type="button" disabled={pending} onClick={onRefresh} className={TEXT_LINK}>
                {busyKey === "refresh" ? "Refreshing…" : cola.fetchedAt ? "Refresh" : "Fetch"}
              </button>
              <span aria-hidden>·</span>
            </>
          ) : null}
          <a href={colaFormUrl(cola.ttbId)} target="_blank" rel="noreferrer" className={TEXT_LINK}>
            Printable application ↗
          </a>
          {onRemove ? (
            <>
              <span aria-hidden>·</span>
              <button
                type="button"
                disabled={pending}
                onClick={onRemove}
                className="hover:text-destructive hover:underline disabled:opacity-50"
              >
                {busyKey === "remove" ? "Removing…" : "Remove"}
              </button>
            </>
          ) : null}
        </p>
        {cola.applicantName ? (
          <p className="text-xs text-muted-foreground">
            * The permit holder that filed the label; not always who distilled it.
          </p>
        ) : null}
        {cola.fetchError ? <p className="text-xs text-destructive">{cola.fetchError}</p> : null}
      </div>
    </div>
  );
}
