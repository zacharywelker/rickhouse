import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import type { FlightModel, RowModel } from "@/lib/tournaments/bracket-model";
import { cn } from "@/lib/utils";

/** The fixed columns, shared by the header and every row: name, proof, mashbill, age. Under `sm` the name takes a line and the other three share the next. */
const COLUMNS = "grid min-w-0 flex-1 grid-cols-[4.5rem_minmax(0,1fr)_4rem] items-baseline gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(0,1fr)_2.5rem_4.75rem_2.75rem] sm:gap-x-2";

/** The width of the controls at the end of a row: one 44px button each, or the small arrow of an advancer. */
const SLOT = ["w-6", "w-11", "w-[5.5rem]"] as const;
export type Slots = 0 | 1 | 2;

export function ColumnHeader({ decided, slots }: { decided: boolean; slots: Slots }) {
  return (
    <div className="hidden items-center border-l-[3px] border-t border-transparent border-t-border py-1 pl-2 text-xs text-muted-foreground sm:flex">
      {decided ? <span className="w-6 shrink-0" aria-hidden /> : null}
      <span className={cn(COLUMNS, "items-center")}>
        <span>Bottle</span>
        <span className="text-right">Proof</span>
        <span>Mashbill</span>
        <span className="text-right">Age</span>
      </span>
      <span className={cn("shrink-0", SLOT[slots])} aria-hidden />
    </div>
  );
}

/**
 * One bottle of a flight: its place (when decided), its facts in fixed columns, and `action` (Move, Withdraw) at the end.
 * `mark` highlights a search hit; the row takes focus when the search steps to it.
 */
export function EntryRow({
  row,
  flight,
  action,
  slots,
  domId,
  mark,
}: {
  row: RowModel;
  flight: FlightModel;
  action?: ReactNode;
  slots: Slots;
  domId: string;
  mark?: "match" | "current";
}) {
  const decided = flight.status !== "pending";
  const out = flight.status === "decided" && !row.advanced;
  return (
    <li
      id={domId}
      tabIndex={-1}
      className={cn(
        "flex min-h-11 scroll-mt-24 focus:outline-none items-center border-l-[3px] border-t border-transparent border-t-border py-1.5 pl-2",
        row.advanced && "border-l-foreground",
        out && "text-muted-foreground",
        mark && "bg-muted",
        mark === "current" && "outline outline-2 -outline-offset-2 outline-foreground",
      )}
    >
      {decided ? (
        <span className="w-6 shrink-0 text-center text-base font-semibold tabular-nums" aria-label={row.place === null ? undefined : `Place ${row.place}`}>
          {row.place ?? ""}
        </span>
      ) : null}
      <span className={COLUMNS}>
        <span className="col-span-3 text-sm leading-snug sm:col-span-1">{row.name}</span>
        <span className="text-xs tabular-nums sm:text-right sm:text-sm">
          {row.proof}
          {row.proof === "—" ? null : <span className="sm:hidden"> proof</span>}
        </span>
        <span className="text-xs sm:text-sm">{row.mashbill}</span>
        <span className="text-right text-xs tabular-nums sm:text-sm">{row.age}</span>
      </span>
      <span className={cn("flex shrink-0 items-center justify-end", SLOT[row.advanced ? 0 : slots])}>
        {row.advanced ? (
          <>
            <ArrowRight className="size-4" aria-hidden />
            <span className="sr-only">Advances</span>
          </>
        ) : (
          action
        )}
      </span>
    </li>
  );
}
