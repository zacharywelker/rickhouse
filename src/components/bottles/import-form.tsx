"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { importAction, type ImportState } from "@/app/(app)/bottles/import/actions";

const IDLE: ImportState = { report: null, error: null };

export function ImportForm() {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importAction, IDLE);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction}>
        <Card>
          <CardHeader>
            <CardTitle>Your rows</CardTitle>
            <CardDescription>Upload a file, or paste the rows straight in.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="file">CSV file</Label>
              <input
                id="file"
                name="file"
                type="file"
                accept=".csv,text/csv"
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:bg-muted/70"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pasted">Or paste rows</Label>
              <Textarea
                id="pasted"
                name="pasted"
                rows={6}
                // Browsers collapse newlines in a placeholder, so the example row lives below.
                placeholder="brand,expression,category"
                aria-describedby="pasted-example"
                className="font-mono text-xs"
              />
              <p id="pasted-example" className="text-xs text-muted-foreground">
                A header row, then one row per bottle — <code>Weller,Antique 107,Bourbon</code>.
              </p>
            </div>

            {state.error ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {state.error}
              </p>
            ) : null}

            <Button type="submit" disabled={pending} className="w-fit">
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Import
            </Button>
          </CardContent>
        </Card>
      </form>

      {state.report ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {state.report.created} imported
              {state.report.failed > 0 ? `, ${state.report.failed} failed` : ""}
            </CardTitle>
            <CardDescription>
              {state.report.failed === 0 ? (
                <>
                  All rows landed.{" "}
                  <Link href="/bottles" className="text-primary hover:underline">
                    See the collection
                  </Link>
                  .
                </>
              ) : (
                "Rows that worked were kept. Fix the rest and import them again — nothing is rolled back."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16">Line</TableHead>
                  <TableHead>Bottle</TableHead>
                  <TableHead>What happened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.report.outcomes.map((outcome) => (
                  <TableRow key={outcome.line}>
                    <TableCell className="tabular-nums text-muted-foreground">{outcome.line}</TableCell>
                    <TableCell className="font-medium">{outcome.label}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {outcome.status === "created" ? (
                          <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
                        ) : (
                          <XCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                        )}
                        <span className={outcome.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                          {outcome.detail}
                        </span>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
