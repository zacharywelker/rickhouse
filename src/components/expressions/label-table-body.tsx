"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Check, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useMoney } from "@/components/currency-context";
import { cn, formatNumeric } from "@/lib/utils";
import { groupApplies, type LabelColumn, type LabelColumnGroup } from "@/lib/expressions/columns";
import type { FieldSpec } from "@/lib/admin/types";
import { describeAgeParts } from "@/lib/expressions/display";
import { describeLinks } from "@/lib/expressions/links";
import type { ExpressionRow } from "@/lib/expressions/queries";
import { STRENGTH_TIER_LABELS, hiddenFields, strengthTier } from "@/lib/expressions/rules";
import type { CategoryKind } from "@/lib/expressions/rules";
import { BRANDY_MINIMUM_YEARS, isAgaveKind } from "@/lib/expressions/spirit-details";
import { isGinKind } from "@/lib/expressions/gin-details";
import { whiskeyAge } from "@/lib/expressions/whiskey-age";

export type ShownColumn = { column: LabelColumn; group: LabelColumnGroup };

/** What still fits on a phone. Brand folds into the label cell there. */
export const PHONE_COLUMNS: ReadonlySet<string> = new Set(["name", "proof", "bottles"]);

const DASH = <span className="text-muted-foreground">—</span>;

/**
 * Mirrors the bottle grid's double-click-to-open (SPEC M8): the row opens
 * the label's page, skipped when the pointer is on something that
 * already does its own thing or there is a text selection to preserve.
 */
function openOnDoubleClick(event: React.MouseEvent, router: ReturnType<typeof useRouter>, id: number) {
  if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea, [role='slider']")) {
    return;
  }
  if ((window.getSelection()?.toString() ?? "") !== "") return;
  router.push(`/expressions/${id}` as Route);
}

/** A stored value as the table shows it, by the kind of field it is. */
function display(spec: FieldSpec, value: unknown, money: (v: string) => string): React.ReactNode {
  if (value === null || value === undefined || value === "") return DASH;
  switch (spec.kind) {
    case "checkbox":
      return value === true ? <Check role="img" aria-label="Yes" className="inline size-4 text-primary" /> : DASH;
    case "select": {
      const option = spec.options.find((o) => o.value === String(value));
      return option && option.value !== "" ? option.label : DASH;
    }
    case "number":
      return spec.money ? money(String(value)) : formatNumeric(String(value));
    default:
      return (
        <span className="block max-w-56 truncate" title={String(value)}>
          {String(value)}
        </span>
      );
  }
}

export function LabelTableBody({
  rows,
  shown,
  categoryKinds,
}: {
  rows: ExpressionRow[];
  shown: ShownColumn[];
  categoryKinds: Record<number, CategoryKind>;
}) {
  const router = useRouter();
  const money = useMoney();

  function viewCell(row: ExpressionRow, column: LabelColumn) {
    switch (column.id) {
      case "name":
        return (
          <>
            {/* Brand folds in here on a phone, so the name alone still says which label it is. */}
            <span className="block text-xs text-muted-foreground sm:hidden">{row.brand}</span>
            <Link href={`/expressions/${row.id}`} className="text-accent hover:underline">
              {row.name}
            </Link>
            {row.fieldGroup === "amaro" && row.amaroStyle ? <span className="block truncate text-xs text-muted-foreground">{row.amaroStyle}</span> : null}
            {row.fieldGroup === "liqueur" || row.fieldGroup === "vodka" ? (() => {
              const chosenKind = row.fieldGroup === "vodka" && categoryKinds[row.categoryId] !== "flavored-vodka" ? "vodka_base" : "flavor";
              const ingredients = (row.links.ingredients ?? []).filter((item) => item.kind === chosenKind).map((item) => item.name).join(", ");
              return ingredients ? <span className="block max-w-56 truncate text-xs text-muted-foreground" title={ingredients}>{ingredients}</span> : null;
            })() : null}
            {row.pickCount > 0 ? (
              <Badge className="ml-2 border-primary/40 text-primary">
                {row.pickCount} pick{row.pickCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </>
        );
      case "brand":
        return <span className="font-medium">{row.brand}</span>;
      case "category":
        return row.category;
      case "abv":
        return row.abv === null ? DASH : `${formatNumeric(row.abv)}%`;
      case "strength": {
        const tier = strengthTier(row.fieldGroup, row.proof);
        return tier ? STRENGTH_TIER_LABELS[tier] : DASH;
      }
      case "age":
        if (row.fieldGroup === "vodka" || ((row.fieldGroup === "amaro" || row.fieldGroup === "liqueur") && !row.isAged)) return DASH;
        if (row.fieldGroup === "whiskey") {
          const resolved = whiskeyAge(row, categoryKinds[row.categoryId] ?? "other");
          return resolved.inferred ? <abbr tabIndex={0} title={resolved.explanation ?? undefined} className="cursor-help italic no-underline">{resolved.text}</abbr> : resolved.text ?? DASH;
        }
        // A zero age is no age at all: say what the label does claim instead.
        return (
          describeAgeParts(row.ageYears, row.ageMonths, row.ageDays) ??
          (row.ageStatement ?? (row.isNas ? "NAS" : row.isStraight ? "Straight" : DASH))
        );
      case "bottles":
        return row.bottleCount;
      case "distilleries":
      case "mashbills":
      case "finishes": {
        if (column.id === "mashbills" && ["rum", "agave", "brandy", "gin", "vodka", "amaro", "liqueur"].includes(row.fieldGroup)) return DASH;
        const text = describeLinks(column.id, row.links[column.id]);
        return text === "" ? (
          DASH
        ) : (
          <span className="block max-w-56 truncate" title={text}>
            {text}
          </span>
        );
      }
      case "ingredients": {
        if (!["rum", "agave", "brandy", "gin", "vodka", "amaro", "liqueur"].includes(row.fieldGroup)) return DASH;
        const categoryKind = categoryKinds[row.categoryId] ?? "other";
        const wanted = categoryKind === "flavored-vodka" || row.fieldGroup === "liqueur" ? "flavor" : row.fieldGroup === "vodka" ? "vodka_base" : row.fieldGroup === "amaro" ? "botanical" : null;
        const text = (row.links.ingredients ?? []).filter((item) => wanted === null || item.kind === wanted).map((item) => item.name).join(", ");
        return text ? <span className="block max-w-56 truncate" title={text}>{text}</span> : DASH;
      }
      default: {
        const spec = column.specs[0]!;
        return display(spec, (row as unknown as Record<string, unknown>)[spec.name], money);
      }
    }
  }

  return (
    <TableBody>
      {rows.map((row) => {
        const fieldGroup = row.fieldGroup;
        const kind = categoryKinds[row.categoryId] ?? "other";
        const hidden = hiddenFields({ group: fieldGroup, kind, values: row as unknown as Record<string, unknown>, ginAged: row.isAgedGin === true });
        return (
          <TableRow key={row.id} onDoubleClick={(event) => openOnDoubleClick(event, router, row.id)} className="cursor-pointer">
            {shown.map(({ column, group }) => {
              const applies = groupApplies(group, fieldGroup)
                && !hidden.has(column.id)
                && !(column.id === "age" && hidden.has("ageYears"))
                && !(column.id === "tequilaClass" && kind !== "tequila")
                && !(column.id === "brandyGrade" && !BRANDY_MINIMUM_YEARS[kind])
                && !(column.id === "ginStyle" && kind !== "gin")
                && !(column.id === "isAgedGin" && !isGinKind(kind))
                && !(column.id === "ingredients" && !["rum", "agave", "brandy", "gin", "vodka", "amaro", "liqueur"].includes(fieldGroup))
                && !(column.id === "mashbills" && ["rum", "agave", "brandy", "gin", "vodka", "amaro", "liqueur"].includes(fieldGroup))
                && !(["barrelFilledOn", "bottledOn", "isNas"].includes(column.id) && isAgaveKind(kind))
                && !(column.id === "ageStatement" && (kind === "tequila" || isGinKind(kind)))
                && !(["barrelFilledOn", "bottledOn"].includes(column.id) && isGinKind(kind))
                && !(column.id === "age" && isGinKind(kind) && row.isAgedGin !== true)
                && !(column.id === "isNas" && isGinKind(kind) && row.isAgedGin !== true);
              return (
                <TableCell
                  key={column.id}
                  className={cn(!PHONE_COLUMNS.has(column.id) && "hidden sm:table-cell", column.numeric && "text-right tabular-nums")}
                >
                  {applies ? (
                    viewCell(row, column)
                  ) : (
                    <span className="text-muted-foreground/60" title="Not used for this category">
                      —
                    </span>
                  )}
                </TableCell>
              );
            })}

            <TableCell className="text-right">
              <Button variant="ghost" size="sm" asChild>
                <Link
                  href={`/expressions/${row.id}/edit`}
                  aria-label={`Edit ${row.brand} ${row.name}`}
                  title={`Edit ${row.brand} ${row.name}`}
                >
                  <Pencil className="size-4" />
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  );
}
