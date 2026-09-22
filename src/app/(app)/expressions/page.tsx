import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listExpressions } from "@/lib/expressions/queries";
import { formatMoney, formatNumeric } from "@/lib/utils";

export const metadata: Metadata = { title: "Expressions" };
export const dynamic = "force-dynamic";

export default async function ExpressionsPage() {
  const rows = await listExpressions();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl text-accent">Expressions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The products, separate from the bottles on your shelf. Two batches of the same name are two expressions;
            two bottles of one batch are one expression.
          </p>
        </div>
        <Button asChild>
          <Link href="/expressions/new">
            <Plus className="size-4" />
            New expression
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="font-display text-lg">No expressions yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Start with the product — brand, mashbill, proof — then add the bottle you actually own.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/expressions/new">
              <Plus className="size-4" />
              New expression
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {/* Brand folds into the Expression cell on a phone; the
                    edit link is the only way into an expression, so it is the
                    one column that must never be squeezed off the edge. */}
                <TableHead className="hidden sm:table-cell">Brand</TableHead>
                <TableHead>Expression</TableHead>
                <TableHead className="hidden sm:table-cell">Category</TableHead>
                <TableHead className="text-right">Proof</TableHead>
                <TableHead className="hidden text-right sm:table-cell">MSRP</TableHead>
                <TableHead className="text-right">Bottles</TableHead>
                <TableHead className="w-12 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="hidden font-medium sm:table-cell">{row.brand}</TableCell>
                  <TableCell>
                    <span className="block text-xs text-muted-foreground sm:hidden">{row.brand}</span>
                    <span className="text-accent">{row.name}</span>
                    {row.batch ? <span className="text-muted-foreground"> · {row.batch}</span> : null}
                    {row.isSingleBarrel || row.isSingleBarrelPick ? (
                      <Badge className="ml-2 border-primary/40 text-primary">
                        {row.isSingleBarrelPick ? "Pick" : "Single barrel"}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{row.category}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumeric(row.proof)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {formatMoney(row.msrp)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.bottleCount}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/expressions/${row.id}/edit`} aria-label={`Edit ${row.brand} ${row.name}`}>
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
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
