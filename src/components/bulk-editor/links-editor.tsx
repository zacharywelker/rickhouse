"use client";

import * as React from "react";
import { labelLinksAction } from "@/app/(app)/bulk-editor/actions";
import { DistilleryPicker, FinishPickers, IngredientPickers, MashbillPicker, type LabelLinks } from "@/components/expressions/label-link-pickers";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { Option } from "@/lib/admin/types";
import { isSingleMaltCategory, showsFinishes, type CategoryKind } from "@/lib/expressions/rules";
import { linkedFacts, linksFromLoaded, LINK_KEYS, type LinkKey, type LinkLists } from "@/lib/bulk-editor/links";
import type { SheetLabel } from "@/lib/bulk-editor/sheet";

export type LinkOptions = { distilleryLinks: Option[]; mashbillLinks: Option[]; finishLinks: Option[] };

/**
 * The cell for one of a label's lists, opened: the label form's own picker in a popover over the cell (`label-link-pickers`),
 * so order, shares, which distillery made each mashbill, finish pairs, creating one on the spot and every message are the
 * form's. Each change is handed up as it is made (the sheet saves as it goes). The label's lists are read as the form's edit
 * page reads them, with finish pairs, when the popover opens; a label that is not saved yet starts from what has been typed.
 */
export function LinksEditor({
  which,
  label,
  kind,
  labelId,
  start,
  edited,
  cached,
  options,
  onChange,
  onLoaded,
  onClose,
}: {
  which: LinkKey;
  label: SheetLabel;
  kind: CategoryKind | null;
  /** Null for a label that does not exist yet. */
  labelId: number | null;
  /** The lists as the sheet holds them now (the label's, with what has been edited over them), and which of them have been edited. */
  start: LinkLists;
  edited: ReadonlyArray<LinkKey>;
  /** The label's lists as they were last read in full, if they have been. */
  cached: () => LinkLists | undefined;
  options: LinkOptions;
  /** A list changed: the lists now, which of them changed, and what a distillery link brings along. */
  onChange: (lists: LinkLists, changed: LinkKey[], brought: Record<string, string>) => void;
  /** The label's lists were read in full: the sheet keeps them to send what was not edited. */
  onLoaded: (lists: LinkLists) => void;
  onClose: () => void;
}) {
  const [lists, setLists] = React.useState<LinkLists | null>(() => (labelId === null ? start : (cached() ?? null)));
  const [failed, setFailed] = React.useState(false);
  const live = React.useRef<LinkLists | null>(lists);
  React.useLayoutEffect(() => {
    live.current = lists;
  });

  React.useEffect(() => {
    if (labelId === null || cached()) return;
    let cancelled = false;
    labelLinksAction(labelId)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) return setFailed(true);
        const full = linksFromLoaded(loaded);
        onLoaded(full);
        // What has been edited since is kept over what was read.
        const merged: LinkLists = { ...full };
        for (const key of edited) (merged as Record<string, unknown>)[key] = start[key];
        setLists(merged);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
    // Read once, when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = (next: LabelLinks, brings: boolean) => {
    const before = live.current;
    if (!before) return;
    const after: LinkLists = { distilleries: next.distilleries, mashbills: next.mashbills, finishes: next.finishes, ingredients: next.ingredients ?? [] };
    const changed = LINK_KEYS.filter((key) => JSON.stringify(after[key]) !== JSON.stringify(before[key]));
    if (changed.length === 0) return;
    setLists(after);
    onChange(after, changed, brings ? linkedFacts(label, kind, options.distilleryLinks, before.distilleries, after.distilleries) : {});
  };

  const links: LabelLinks | null = lists && { distilleries: lists.distilleries, mashbills: lists.mashbills, finishes: lists.finishes, ingredients: lists.ingredients };
  const plain = (next: LabelLinks) => apply(next, false);
  const common = { fieldGroup: label.fieldGroup, kind, links: links!, onLinksChange: plain };
  const title = { distilleries: "Distillery", mashbills: "Mashbill", finishes: "Finish", ingredients: "Ingredients" }[which];

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor asChild>
        <div className="absolute inset-0" />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        // The popover opens in place of the cell's own editor: Escape and a click away close it, and nothing is lost, since each change has already been made.
        className="flex max-h-[min(36rem,80dvh)] w-[min(34rem,calc(100vw-2rem))] flex-col gap-4 overflow-y-auto p-3"
        aria-label={`${title}, as on the label form`}
        data-bulk-editor-panel=""
      >
        {failed ? (
          <p role="alert" className="text-sm text-destructive">Could not read this label&rsquo;s {title.toLowerCase()}. Close this and try again.</p>
        ) : !links ? (
          <p className="text-sm text-muted-foreground">Reading {title.toLowerCase()}…</p>
        ) : which === "distilleries" ? (
          <DistilleryPicker fieldGroup={label.fieldGroup} kind={kind} options={options.distilleryLinks} links={links} changeLinks={(next) => apply(next, true)} />
        ) : which === "mashbills" ? (
          <MashbillPicker {...common} singleMalt={isSingleMaltCategory(label.categorySlug)} categoryName={label.category} options={options.mashbillLinks} />
        ) : which === "finishes" ? (
          <FinishPickers {...common} shown={showsFinishes({ group: label.fieldGroup, ginAged: label.isAgedGin === true, values: label as unknown as Record<string, unknown> })} options={options.finishLinks} />
        ) : (
          <IngredientPickers {...common} />
        )}
      </PopoverContent>
    </Popover>
  );
}
