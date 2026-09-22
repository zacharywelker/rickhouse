import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { ArrowDown, ArrowUp, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LabelTableBody } from "@/components/expressions/label-table-body";
import { listExpressions, parseLabelSort, type LabelSort } from "@/lib/expressions/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Labels" };
export const dynamic = "force-dynamic";

const COLUMNS: Array<{ key: LabelSort; label: string; className?: string; numeric?: boolean }> = [
  { key: "brand", label: "Brand", className: "hidden sm:table-cell" },
  { key: "name", label: "Label" },
  { key: "category", label: "Category", className: "hidden sm:table-cell" },
  { key: "proof", label: "Proof", numeric: true },
  { key: "msrp", label: "MSRP", className: "hidden sm:table-cell", numeric: true },
  { key: "bottles", label: "Bottles", numeric: true },
];

/**
 * Sorting is server-side and lives in the URL, exactly like the bottle grid —
 * so a sorted view is a bookmark and the back button behaves (SPEC M8).
 */
function SortLink({
  column,
  sort,
  desc,
}: {
  column: (typeof COLUMNS)[number];
  sort: LabelSort;
  desc: boolean;
}) {
  const active = sort === column.key;
  // Clicking the active column flips it; a new column starts ascending.
  const params = new URLSearchParams({ sort: column.key });
  if (active && !desc) params.set("dir", "desc");
  return (
    <Link
      href={`/expressions?${params.toString()}` as Route}
      aria-label={`Sort by ${column.label}`}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground",
        active && "text-primary",
      )}
    >
      {column.label}
      {active ? (
        desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />
      ) : (
        <ChevronsUpDown className="size-3 opacity-40" />
      )}
    </Link>
  );
}

export default async function ExpressionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const sort = parseLabelSort(raw);
  const desc = (Array.isArray(params.dir) ? params.dir[0] : params.dir) === "desc";
  const rows = await listExpressions(sort, desc);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl text-accent">Labels</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The products, separate from the bottles on your shelf. Batch and single-barrel detail belong to the
            bottle, so six picks of one Weller 12 are six bottles of one label.
          </p>
        </div>
        <Button asChild>
          <Link href="/expressions/new">
            <Plus className="size-4" />
            New Label
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-lg">No labels yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Start with the product — brand, mashbill, proof — then add the bottle you actually own.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/expressions/new">
              <Plus className="size-4" />
              New Label
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {COLUMNS.map((column) => (
                  <TableHead
                    key={column.key}
                    className={cn(column.className, column.numeric && "text-right")}
                  >
                    <SortLink column={column} sort={sort} desc={desc} />
                  </TableHead>
                ))}
                <TableHead className="w-12 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <LabelTableBody rows={rows} />
          </Table>
        </div>
      )}
    </div>
  );
}
