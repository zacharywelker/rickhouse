"use client";

import * as React from "react";
import { labelOtherNamesAction, labelReleasesAction } from "@/app/(app)/bulk-editor/actions";
import { OTHER_NAME_COLUMNS, otherNameRows, RELEASE_COLUMNS } from "@/components/expressions/label-list-columns";
import { RegionPicker } from "@/components/expressions/region-picker";
import { RowListEditor } from "@/components/expressions/row-list-editor";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { parseRegions } from "@/lib/expressions/rules";
import { otherNamesRowsText, parseOtherNames } from "@/lib/other-names";
import type { PanelKey } from "@/lib/bulk-editor/panels";

type Rows = Array<Record<string, string>>;
type Loaded = { kind: "otherNames"; rows: Rows } | { kind: "releases"; rows: Rows; impact: Record<string, string> };

const TITLES: Record<PanelKey, string> = { regions: "Regions", otherNames: "Other / old names", releases: "Known releases" };

/**
 * The cell for a label's regions, older names or known releases, opened: the label form's own control in a popover over
 * the cell (the six region buttons, or the same list of rows), saved as it is changed. The lists are read as the form's
 * edit page reads them when it opens; what has been edited since is kept over what was read.
 */
export function PanelEditor({
  which,
  labelId,
  regions,
  edited,
  onChange,
  onClose,
}: {
  which: PanelKey;
  /** Null for a label that does not exist yet (regions only). */
  labelId: number | null;
  /** The label's regions as the sheet holds them now. */
  regions: string[];
  /** The text this cell has been edited to, if it has. */
  edited: string | undefined;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [failed, setFailed] = React.useState(false);
  const last = React.useRef<string | undefined>(edited);

  React.useEffect(() => {
    if (which === "regions" || labelId === null) return;
    let cancelled = false;
    const done = (value: Loaded | null) => {
      if (cancelled) return;
      if (value === null) setFailed(true);
      else setLoaded(value);
    };
    if (which === "otherNames") {
      labelOtherNamesAction(labelId).then((names) => done(names === null ? null : { kind: "otherNames", rows: edited !== undefined ? otherNameRows(parseOtherNames(edited).names) : otherNameRows(names) })).catch(() => done(null));
    } else {
      labelReleasesAction(labelId)
        .then((read) => {
          let rows: Rows = read ? (read.rows as unknown as Rows) : [];
          if (edited !== undefined) {
            try {
              const parsed: unknown = JSON.parse(edited);
              if (Array.isArray(parsed)) rows = parsed as Rows;
            } catch {
              // Keep what was read.
            }
          }
          done(read === null ? null : { kind: "releases", rows, impact: read.impact });
        })
        .catch(() => done(null));
    }
    return () => {
      cancelled = true;
    };
    // Read once, when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Hands a change up, unless it is what the cell already has (opening it makes the list report its rows once). */
  const emit = (value: string) => {
    if (value === last.current) return;
    last.current = value;
    onChange(value);
  };

  const title = TITLES[which];
  const current = edited !== undefined && which === "regions" ? parseRegions(edited) : regions;

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor asChild>
        <div className="absolute inset-0" />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="flex max-h-[min(36rem,80dvh)] w-[min(40rem,calc(100vw-2rem))] flex-col gap-4 overflow-y-auto p-3"
        aria-label={`${title}, as on the label form`}
        data-bulk-editor-panel=""
      >
        {which === "regions" ? (
          <RegionPicker idPrefix="sheet" value={current} onChange={(next) => emit(next.join(", "))} />
        ) : failed ? (
          <p role="alert" className="text-sm text-destructive">Could not read this label&rsquo;s {title.toLowerCase()}. Close this and try again.</p>
        ) : !loaded ? (
          <p className="text-sm text-muted-foreground">Reading {title.toLowerCase()}…</p>
        ) : loaded.kind === "otherNames" ? (
          <RowListEditor
            name="otherNames"
            idPrefix="sheet-otherName"
            addLabel="Add an older name"
            columns={OTHER_NAME_COLUMNS}
            initialRows={loaded.rows}
            toText={otherNamesRowsText}
            onChange={(rows) => emit(otherNamesRowsText(rows))}
            savesAtOnce
          />
        ) : (
          <RowListEditor
            name="releases"
            idPrefix="sheet-release"
            addLabel="Add a release"
            columns={RELEASE_COLUMNS}
            initialRows={loaded.rows}
            toText={(rows) => JSON.stringify(rows)}
            removeWarning={(row) => loaded.impact[row.id ?? ""] ?? null}
            onChange={(rows) => emit(JSON.stringify(rows))}
            savesAtOnce
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
