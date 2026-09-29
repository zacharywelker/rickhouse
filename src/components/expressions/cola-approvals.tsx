"use client";

import * as React from "react";
import { useActionState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ExternalLink, ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addColaAction,
  refreshColaAction,
  removeColaAction,
  copyColaImageToBottleAction,
} from "@/app/(app)/expressions/cola-actions";
import { IDLE_RESULT, type ActionResult } from "@/lib/admin/types";
import { colaDetailUrl } from "@/lib/cola/ids";
import { registryCase } from "@/lib/cola/map";
import { cn, formatDate } from "@/lib/utils";

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
  images: { id: number; filePath: string; thumbPath: string | null; panel: string | null }[];
};

/**
 * A label's TTB approvals (SPEC M11). On the label form ("label") they are
 * managed: added by TTB ID, looked up again, removed. On a bottle's page
 * ("bottle") they are shown, and a label panel can be copied into the
 * bottle's own photos.
 */
export function ColaApprovals(
  props: { colas: ColaView[]; lookupEnabled: boolean } & (
    | { mode: "label"; expressionId: number }
    | { mode: "bottle"; bottleId: number }
  ),
) {
  const { colas, lookupEnabled } = props;
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<ActionResult>(IDLE_RESULT);

  function run(key: string, action: () => Promise<ActionResult>) {
    setBusyKey(key);
    startTransition(async () => {
      setNotice(await action());
      setBusyKey(null);
      router.refresh();
    });
  }

  if (props.mode === "bottle" && colas.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {props.mode === "label" ? (
        <AddCola expressionId={props.expressionId} lookupEnabled={lookupEnabled} onDone={setNotice} />
      ) : null}

      <Notice result={notice} />

      {colas.length === 0 ? (
        <p className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No label approvals yet. Every spirit sold in the US has one; find it by brand in{" "}
          <a
            href="https://www.ttbonline.gov/colasonline/publicSearchColasBasic.do"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            TTB&rsquo;s public registry
          </a>{" "}
          and paste its TTB ID here.
        </p>
      ) : (
        <ul className="flex flex-col gap-6">
          {colas.map((cola) => (
            <li key={cola.id} className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-col">
                  <span className="font-medium">
                    {cola.brandName ? registryCase(cola.brandName) : `TTB ID ${cola.ttbId}`}
                    {cola.fancifulName ? <span className="text-accent"> {registryCase(cola.fancifulName)}</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    TTB ID {cola.ttbId}
                    {cola.approvedOn ? ` · approved ${formatDate(cola.approvedOn)}` : null}
                    {cola.status && cola.status !== "APPROVED" ? ` · ${registryCase(cola.status)}` : null}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={colaDetailUrl(cola.ttbId)} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-3.5" />
                      View on TTB
                    </a>
                  </Button>
                  {props.mode === "label" && lookupEnabled ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => run(`refresh-${cola.id}`, () => refreshColaAction(cola.id))}
                    >
                      {busyKey === `refresh-${cola.id}` ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}
                      {cola.fetchedAt ? "Refresh" : "Fetch"}
                    </Button>
                  ) : null}
                  {props.mode === "label" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      aria-label={`Remove ${cola.ttbId}`}
                      onClick={() => run(`remove-${cola.id}`, () => removeColaAction(cola.id))}
                    >
                      {busyKey === `remove-${cola.id}` ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  ) : null}
                </div>
              </div>

              {cola.fetchedAt ? (
                <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
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
                    {cola.permitNumber ? <span className="block text-muted-foreground">{cola.permitNumber}</span> : null}
                    {cola.applicantAddress ? (
                      <span className="block text-xs text-muted-foreground">{cola.applicantAddress}</span>
                    ) : null}
                  </Fact>
                </dl>
              ) : lookupEnabled ? null : (
                <p className="text-sm text-muted-foreground">Lookups are off on this server; the link above opens the record.</p>
              )}

              {cola.fetchError ? (
                <p className="text-sm text-destructive">{cola.fetchError}</p>
              ) : null}

              {cola.images.length > 0 ? (
                <ul className="flex flex-wrap items-end gap-4">
                  {cola.images.map((image) => (
                    <li key={image.id} className="flex max-w-56 flex-col gap-1.5">
                      <a href={`/api/images/${image.filePath}`} target="_blank" rel="noreferrer" className="block">
                        <Image
                          src={`/api/images/${image.thumbPath ?? image.filePath}`}
                          alt={`${image.panel ?? "Label"} — TTB ID ${cola.ttbId}`}
                          width={224}
                          height={224}
                          unoptimized
                          className="max-h-40 w-auto border border-border object-contain"
                        />
                      </a>
                      <span className="text-xs text-muted-foreground">{image.panel ?? "Label"}</span>
                      {props.mode === "bottle" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="self-start"
                          disabled={pending}
                          onClick={() =>
                            run(`photo-${image.id}`, () => copyColaImageToBottleAction(image.id, props.bottleId))
                          }
                        >
                          {busyKey === `photo-${image.id}` ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <ImagePlus className="size-3.5" />
                          )}
                          Use as photo
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
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

function AddCola({
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
    <form ref={formRef} action={formAction} className="flex flex-col gap-1.5">
      <Label htmlFor="cola-ttb-id">Add a TTB ID</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="cola-ttb-id"
          name="ttbId"
          inputMode="numeric"
          autoComplete="off"
          placeholder="21132001000620, or the registry link"
          className="max-w-sm"
          aria-invalid={!state.ok && Boolean(state.fieldErrors?.ttbId)}
        />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {lookupEnabled ? "Add and fetch" : "Add"}
        </Button>
      </div>
    </form>
  );
}
