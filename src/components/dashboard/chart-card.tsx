"use client";

import * as React from "react";
import { Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * The shell every chart sits in.
 *
 * The table toggle is not a nicety: colour alone must never be the only way to
 * read a chart, and a screen reader cannot read an SVG of bars. Every chart
 * here ships with the numbers behind it one click away.
 */
export function ChartCard({
  title,
  description,
  tableHeaders,
  tableRows,
  empty,
  children,
}: {
  title: string;
  description?: string;
  tableHeaders: string[];
  tableRows: Array<Array<string | number>>;
  empty?: string;
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = React.useState(false);
  const id = React.useId();

  return (
    <Section className="flex flex-col">
      <SectionHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <SectionTitle>{title}</SectionTitle>
          {description ? <SectionDescription>{description}</SectionDescription> : null}
        </div>
        {tableRows.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={showTable}
            aria-controls={id}
            onClick={() => setShowTable((v) => !v)}
          >
            <Table2 className="size-4" />
            <span className="sr-only sm:not-sr-only">{showTable ? "Chart" : "Table"}</span>
          </Button>
        ) : null}
      </SectionHeader>
      <SectionContent className="flex-1">
        {tableRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{empty ?? "Not enough data yet."}</p>
        ) : showTable ? (
          <div id={id}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {tableHeaders.map((header, index) => (
                    <TableHead key={header} className={index > 0 ? "text-right" : undefined}>
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.map((row) => (
                  <TableRow key={String(row[0])}>
                    {row.map((cell, index) => (
                      <TableCell
                        key={index}
                        className={index > 0 ? "text-right tabular-nums" : "font-medium"}
                      >
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div id={id}>{children}</div>
        )}
      </SectionContent>
    </Section>
  );
}
