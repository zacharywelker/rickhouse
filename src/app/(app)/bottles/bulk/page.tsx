import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BottleBulkGrid } from "@/components/bottles/bottle-bulk-grid";
import { REFERENCE_OPTION_LOADERS } from "@/lib/admin/registry";
import { expressionOptions } from "@/lib/expressions/queries";

export const metadata: Metadata = { title: "Bulk add bottles" };
export const dynamic = "force-dynamic";

export default async function BulkBottlesPage() {
  const [expressions, stores] = await Promise.all([expressionOptions(), REFERENCE_OPTION_LOADERS.stores()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">Bulk add bottles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add several bottles at once. Tab moves across a row, Enter moves down a column. Rows save independently —
          fixing one bad row never loses the others.
        </p>
      </div>

      {expressions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-lg">No labels yet</p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              A bottle has to be a bottle <em>of</em> something. Create at least one label first.
            </p>
            <Button asChild>
              <Link href="/expressions/new">Create a label</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <BottleBulkGrid expressions={expressions} stores={stores} />
      )}
    </div>
  );
}
