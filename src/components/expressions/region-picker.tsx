"use client";

import { Button } from "@/components/ui/button";
import { SCOTCH_REGIONS } from "@/db/schema";

/** The Scotch regions, as buttons: a blend comes from several. */
export function RegionPicker({
  idPrefix,
  value,
  onChange,
  error,
  sheet = false,
}: {
  idPrefix: string;
  value: string[];
  onChange: (regions: string[]) => void;
  error?: string;
  /** The data-sheet look: the label is the row's, so no box and no visible legend. */
  sheet?: boolean;
}) {
  const Box = sheet ? "div" : "fieldset";
  return (
    <Box className={sheet ? "flex flex-col gap-2" : "col-span-full flex flex-col gap-2 border border-border p-4"}>
      {sheet ? <span className="sr-only">Regions</span> : <legend className="px-1 text-sm font-medium">Regions</legend>}
      {sheet ? null : (
        <p className="-mt-1 text-xs text-muted-foreground">
          Where the whisky comes from; pick several for a blend. Linking a distillery that has a region adds it here.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {SCOTCH_REGIONS.map((region) => {
          const on = value.includes(region);
          return (
            <Button
              key={region}
              id={`${idPrefix}-region-${region}`}
              type="button"
              size="sm"
              variant={on ? "default" : "outline"}
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((r) => r !== region) : [...value, region])}
            >
              {region}
            </Button>
          );
        })}
      </div>
      <input type="hidden" name="regions" value={value.join(", ")} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Box>
  );
}
