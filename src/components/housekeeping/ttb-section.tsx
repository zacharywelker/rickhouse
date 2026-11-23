import { PerPageSelect } from "@/components/housekeeping/per-page-select";
import { SectionNoticeList, SectionNoticesProvider } from "@/components/housekeeping/section-notices";
import { TtbRowView } from "@/components/housekeeping/ttb-row";
import { WindowPager } from "@/components/housekeeping/window-pager";
import { Section, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import type { PageState } from "@/lib/housekeeping/page-state";
import { PER_PAGE_OPTIONS } from "@/lib/housekeeping/photo-params";
import type { TtbRow } from "@/lib/housekeeping/ttb-queries";

/**
 * Housekeeping's TTB approvals section: labels with no TTB approval attached. Each row searches TTB with the label
 * page's own dialog, takes a pasted TTB ID or link, or is marked "Not on TTB" so it stops being listed. Its window and
 * page size (`to`, `tp`) are its own in the address.
 */
export function TtbSection({
  state,
  total,
  rows,
  window,
  lookupEnabled,
}: {
  state: PageState;
  total: number;
  rows: TtbRow[];
  window: { offset: number; from: number; to: number; hasPrev: boolean; hasNext: boolean };
  lookupEnabled: boolean;
}) {
  return (
    <Section aria-labelledby="ttb-heading" className="mt-12">
      <SectionHeader>
        <SectionTitle id="ttb-heading">TTB approvals</SectionTitle>
        <SectionDescription>
          Labels with no TTB approval attached.
          {lookupEnabled ? " “Find on TTB” opens the same search as the label’s own page." : ""} Some labels have none on file (older
          bottlings, small imports); mark those “Not on TTB” so they stop being listed.
        </SectionDescription>
      </SectionHeader>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {lookupEnabled
            ? "Searching TTB’s public registry can take a few seconds."
            : "Searching TTB is off on this server. Paste a TTB ID or link instead."}
        </p>
        <PerPageSelect per={state.ttbPer} options={PER_PAGE_OPTIONS} label="TTB per page" param="tp" resetParam="to" />
      </div>

      <SectionNoticesProvider>
        <SectionNoticeList />
        {rows.length === 0 ? (
          <p className="border border-border bg-card px-4 py-5 text-sm text-muted-foreground">
            Every label has a TTB approval, or you marked it as not on file.
          </p>
        ) : (
          <div>
            {rows.map((row) => (
              <TtbRowView key={row.expressionId} row={row} lookupEnabled={lookupEnabled} />
            ))}
          </div>
        )}
      </SectionNoticesProvider>

      <WindowPager state={state} total={total} window={window} />
    </Section>
  );
}
