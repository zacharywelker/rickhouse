import type { StandingRow } from "@/lib/tournaments/standings-model";
import { cn } from "@/lib/utils";

/** Who finished where: a hairline row each, place first, then where it left the tournament. Ties share a place ("2="). */
export function Standings({ rows, final }: { rows: StandingRow[]; final: boolean }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="standings" className="flex flex-col gap-2">
      <h2 id="standings" className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {final ? "Final standings" : "Standings so far"}
      </h2>
      <ol className="max-w-2xl border-b border-border">
        {rows.map((row) => (
          <li key={row.entryId} className={cn("flex min-h-11 items-baseline gap-3 border-t border-border py-2", row.champion && "border-l-[3px] border-l-foreground pl-2")}>
            <span className="w-8 shrink-0 text-base font-semibold tabular-nums">{row.place}</span>
            <span className="min-w-0 flex-1 text-sm leading-snug">{row.name}</span>
            <span className={cn("shrink-0 text-xs", row.champion ? "font-medium" : "text-muted-foreground")}>{row.left}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
