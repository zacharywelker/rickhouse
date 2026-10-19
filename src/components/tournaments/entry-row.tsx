import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import type { FlightModel, RowModel } from "@/lib/tournaments/bracket-model";
import { cn } from "@/lib/utils";

/**
 * The fixed columns, shared by the header and every row: name, proof, mashbill (with its category under it), age,
 * distillery, finish. Under `md` the name takes a line and the facts stack below it as labelled pairs, two to a line,
 * so no value is cut off.
 */
const COLUMNS =
  "grid min-w-0 flex-1 grid-cols-2 items-baseline gap-x-3 gap-y-1 md:grid-cols-[minmax(0,1.7fr)_2.75rem_minmax(0,1.3fr)_3.5rem_minmax(0,1.2fr)_minmax(0,1.2fr)] md:gap-x-3";

/** The width of the controls at the end of a row: one 44px button each, or the small arrow of an advancer. */
const SLOT = ["w-6", "w-11", "w-[5.5rem]"] as const;
export type Slots = 0 | 1 | 2;

export function ColumnHeader({ decided, slots }: { decided: boolean; slots: Slots }) {
  return (
    <div className="hidden items-center border-l-[3px] border-t border-transparent border-t-border py-1 pl-2 text-xs text-muted-foreground md:flex">
      {decided ? <span className="w-6 shrink-0" aria-hidden /> : null}
      <span className={cn(COLUMNS, "items-center")}>
        <span>Bottle</span>
        <span className="text-right">Proof</span>
        <span>Mashbill</span>
        <span className="text-right">Age</span>
        <span>Distillery</span>
        <span>Finish</span>
      </span>
      <span className={cn("shrink-0", SLOT[slots])} aria-hidden />
    </div>
  );
}

/** One fact: its label shows when the facts are stacked (and reads aloud always), the value follows. */
function Fact({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <span className={cn("flex min-w-0 gap-1.5 text-xs md:block md:text-sm", className)}>
      <span className="shrink-0 text-muted-foreground md:sr-only">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

/**
 * One bottle of a flight: its place (when decided), its facts in fixed columns, and `action` (Move, Remove, Withdraw) at the end.
 * `mark` highlights a search hit; the row takes focus when the search steps to it.
 */
export function EntryRow({
  row,
  flight,
  action,
  slots,
  places,
  domId,
  mark,
}: {
  row: RowModel;
  flight: FlightModel;
  action?: ReactNode;
  slots: Slots;
  /** Show the place column (a decided flight, or a bye in a running tournament). */
  places: boolean;
  domId: string;
  mark?: "match" | "current";
}) {
  const out = flight.status === "decided" && !row.advanced;
  // An advancer's arrow gives way to the row's controls while it can still be edited (a lone bottle of the current round).
  const showArrow = row.advanced && !action;
  const dash = (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">none</span>
    </>
  );
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
      {places ? (
        <span className="w-6 shrink-0 text-center text-base font-semibold tabular-nums">
          <span aria-hidden>{row.place ?? ""}</span>
          {row.place === null ? null : <span className="sr-only">Place {row.place}</span>}
        </span>
      ) : null}
      <span className={COLUMNS}>
        <span className="col-span-2 text-sm leading-snug md:col-span-1">{row.name}</span>
        <Fact label="Proof" className="tabular-nums md:text-right">
          {row.proof === "—" ? dash : row.proof}
        </Fact>
        <Fact label="Mashbill">
          <span className="block">{row.mashbill === "—" ? dash : row.mashbill}</span>
          {row.category ? <span className="block text-xs text-muted-foreground">{row.category}</span> : null}
        </Fact>
        <Fact label="Age" className="tabular-nums md:text-right">
          {row.age === "—" ? dash : row.age}
        </Fact>
        <Fact label="Distillery">{row.distilleries.length > 0 ? row.distilleries.join(", ") : dash}</Fact>
        <Fact label="Finish">{row.finishes.length > 0 ? row.finishes.join(", ") : dash}</Fact>
      </span>
      <span className={cn("flex shrink-0 items-center justify-end", SLOT[showArrow ? 0 : slots])}>
        {showArrow ? (
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
