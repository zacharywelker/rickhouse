"use client";

import * as React from "react";
import { BulkGrid, type BulkSection, type CustomColumn } from "@/components/bulk/bulk-grid";
import { saveExpressionsBulkAction } from "@/app/(app)/expressions/actions";
import { EXPRESSION_SECTIONS } from "@/lib/expressions/fields";
import { offeredAgeStatement } from "@/lib/bottles/age";
import type { FieldGroup } from "@/db/schema";
import type { Option } from "@/lib/admin/types";
import { LINK_KINDS, linksPayload, type LinkKind } from "@/lib/expressions/links";
import type { LinkedRow } from "./ordered-picker";
import { LinksCell } from "./links-cell";

/**
 * Bulk add for labels: every field on the label form, including the rum,
 * agave and whiskey-process detail and the distilleries, mashbills and
 * finishes, so nothing has to be finished off one label at a time afterwards.
 *
 * The per-spirit sections apply row by row, as they do on the form: a
 * Bourbon's rum cells are dashes, and fill in once the row's category is a
 * rum. Anything not needed hides from the Fields menu.
 */
export function ExpressionBulkGrid({
  options,
  categoryGroups,
}: {
  /** Picker options by field name, including the three link lists. */
  options: Record<string, Option[]>;
  /** categoryId -> field group, so a row's sections follow its category. */
  categoryGroups: Record<number, FieldGroup>;
}) {
  const sections = React.useMemo<BulkSection[]>(() => {
    const linkColumn = (kind: LinkKind): CustomColumn => ({
      id: LINK_KINDS[kind].field,
      label: LINK_KINDS[kind].label,
      initial: () => [],
      toPayload: (value) => linksPayload(value as LinkedRow[]),
      className: "min-w-48",
      render: ({ id, labelledBy, value, onChange, values }) => (
        <LinksCell
          kind={kind}
          id={id}
          labelledBy={labelledBy}
          value={value as LinkedRow[]}
          onChange={onChange}
          options={options[LINK_KINDS[kind].field] ?? []}
          {...(kind === "mashbills"
            ? {
                distilleryChoices: (values.distilleryLinks as LinkedRow[]).map((d) => ({ id: d.id, name: d.label })),
              }
            : {})}
        />
      ),
    });
    return [
      ...EXPRESSION_SECTIONS,
      {
        id: "links",
        title: "Where it came from",
        fields: [],
        custom: [linkColumn("distilleries"), linkColumn("mashbills"), linkColumn("finishes")],
      },
    ];
  }, [options]);

  return (
    <BulkGrid
      sections={sections}
      options={options}
      fieldGroupFor={(values) => categoryGroups[Number(values.categoryId)] ?? null}
      onChanged={(prev, next, name) => {
        const offered = offeredAgeStatement(prev, next, name);
        return offered === null ? next : { ...next, ageStatement: offered };
      }}
      save={saveExpressionsBulkAction}
      noun="label"
      storageKey="rickhouse:bulk-labels:hidden"
    />
  );
}
