"use client";

import { Button } from "@/components/ui/button";
import { SCOTCH_REGIONS } from "@/db/schema";

/** The Scotch regions, as buttons: a blend comes from several. */
export function RegionPicker({
  idPrefix,
  value,
  onChange,
  error,
}: {
  idPrefix: string;
  value: string[];
  onChange: (regions: string[]) => void;
  error?: string;
}) {
  return (
    <fieldset className="col-span-full flex flex-col gap-2 border border-border p-4">
      <legend className="px-1 text-sm font-medium">Regions</legend>
      <p className="-mt-1 text-xs text-muted-foreground">
        Where the whisky comes from; pick several for a blend. Linking a distillery that has a region adds it here.
      </p>
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
    </fieldset>
  );
}
