import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { bottleList } from "@/db/schema";
import { formatMoney, formatNumeric, humanise } from "@/lib/utils";

export const metadata: Metadata = { title: "Bottles" };
export const dynamic = "force-dynamic";

/**
 * A plain list for now. Milestone 4 replaces this with the sortable,
 * filterable grid over the same `bottle_list` view.
 */
export default async function BottlesPage() {
  const rows = await db.select().from(bottleList).orderBy(desc(bottleList.dateAcquired), desc(bottleList.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl text-rye-gold">Bottles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every physical bottle you own. Sorting, filtering and the fill gauge arrive in the next milestone.
          </p>
        </div>
        <Button asChild>
          <Link href="/bottles/new">
            <Plus className="size-4" />
            Add bottle
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="font-display text-lg">Nothing on the shelf</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Add the expression first, then the bottle you actually own.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/bottles/new">
              <Plus className="size-4" />
              Add bottle
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Bottle</TableHead>
                <TableHead className="hidden md:table-cell">Distilleries</TableHead>
                <TableHead className="text-right">Proof</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Paid</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/bottles/${row.id}`} className="font-medium hover:text-rye-gold">
                      {row.brand} <span className="text-rye-gold">{row.expressionName}</span>
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {row.category}
                      {row.batch ? ` · ${row.batch}` : ""}
                      {row.store ? ` · ${row.store}` : ""}
                    </p>
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate md:table-cell text-sm text-muted-foreground">
                    {row.distilleries ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumeric(row.proof)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {formatMoney(row.pricePaid)}
                  </TableCell>
                  <TableCell>
                    <Badge className={row.isOpen ? "border-primary/40 text-primary" : ""}>
                      {row.isOpen ? `Open · ${row.fillPct}%` : humanise(row.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
