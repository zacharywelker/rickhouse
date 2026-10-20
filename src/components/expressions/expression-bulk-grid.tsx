"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkGrid, type BulkSection, type CustomColumn } from "@/components/bulk/bulk-grid";
import { saveExpressionsBulkAction } from "@/app/(app)/expressions/actions";
import { EXPRESSION_SECTIONS } from "@/lib/expressions/fields";
import { withAgeDefaults } from "@/lib/bottles/age";
import type { FieldGroup } from "@/db/schema";
import type { Option } from "@/lib/admin/types";
import { LINK_KINDS, linksPayload, type LinkKind } from "@/lib/expressions/links";
import type { LinkedRow } from "./ordered-picker";
import { LinksCell } from "./links-cell";
import { IngredientPicker } from "./ingredient-picker";
import { BRANDY_MINIMUM_YEARS, countryForDistillery, isAgaveKind, type IngredientChoice } from "@/lib/expressions/spirit-details";
import type { CategoryKind } from "@/lib/expressions/rules";
import { isGinKind } from "@/lib/expressions/gin-details";

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
  categoryKinds,
}: {
  /** Picker options by field name, including the three link lists. */
  options: Record<string, Option[]>;
  /** categoryId -> field group, so a row's sections follow its category. */
  categoryGroups: Record<number, FieldGroup>;
  categoryKinds: Record<number, CategoryKind>;
}) {
  const sections = React.useMemo<BulkSection[]>(() => {
    const linkColumn = (kind: LinkKind): CustomColumn => ({
      id: LINK_KINDS[kind].field,
      label: kind === "distilleries" ? "Distilleries / Estates" : LINK_KINDS[kind].label,
      initial: () => [],
      toPayload: (value) => linksPayload(value as LinkedRow[]),
      className: "min-w-48",
      render: ({ id, labelledBy, value, onChange, values, options, onOptionCreated }) => (
        <LinksCell
          kind={kind}
          id={id}
          labelledBy={labelledBy}
          value={value as LinkedRow[]}
          onChange={onChange}
          options={(options[LINK_KINDS[kind].field] ?? []).filter((option) => kind !== "distilleries" || !option.country || countryForDistillery(categoryKinds[Number(values.categoryId)] ?? "other", option.country))}
          onOptionCreated={(option) => onOptionCreated(LINK_KINDS[kind].field, option)}
          {...(kind === "distilleries" ? {
            defaultCountry: isAgaveKind(categoryKinds[Number(values.categoryId)] ?? "other") ? "Mexico"
              : ["cognac", "armagnac", "calvados"].includes(categoryKinds[Number(values.categoryId)] ?? "other") ? "France"
              : categoryKinds[Number(values.categoryId)] === "pisco" ? "Peru" : undefined,
          } : {})}
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
        custom: [linkColumn("distilleries"), linkColumn("mashbills"), {
          id: "ingredientLinks",
          label: "Ingredients",
          initial: () => [] as IngredientChoice[],
          toPayload: (value) => JSON.stringify(value),
          className: "min-w-72",
          render: ({ value, onChange, values }) => {
            const group = categoryGroups[Number(values.categoryId)];
            const kind = categoryKinds[Number(values.categoryId)] ?? "other";
            if (group === "gin" && isGinKind(kind)) {
              const current = value as IngredientChoice[];
              return <div className="flex flex-col gap-2">
                <IngredientPicker kind="botanical" categoryKind={kind} value={current} hiddenName={null}
                  onChange={(selected) => onChange([...current.filter((item) => item.kind !== "botanical"), ...selected])} />
                <IngredientPicker kind="gin_base" categoryKind={kind} value={current} hiddenName={null}
                  onChange={(selected) => onChange([...current.filter((item) => item.kind !== "gin_base"), ...selected])} />
              </div>;
            }
            return group === "agave" || group === "rum" || group === "brandy"
              ? <IngredientPicker kind={group === "agave" ? "maguey" : group === "rum" ? "rum_base" : "distillate"} categoryKind={kind} value={value as IngredientChoice[]} onChange={onChange} />
              : null;
          },
        }, linkColumn("finishes")],
      },
      {
        id: "collection",
        title: "Collection",
        fields: [],
        custom: [
          {
            id: "addBottle",
            label: "Add bottle",
            initial: () => false,
            toPayload: (value) => value === true,
            render: ({ id, labelledBy, value, onChange }) => (
              <div className="flex h-9 items-center justify-center">
                <Checkbox
                  id={id}
                  checked={value === true}
                  onCheckedChange={(checked) => onChange(checked === true)}
                  aria-labelledby={labelledBy}
                />
              </div>
            ),
          },
        ],
      },
    ];
  }, [categoryGroups, categoryKinds, options]);

  return (
    <BulkGrid
      sections={sections}
      options={options}
      fieldGroupFor={(values) => categoryGroups[Number(values.categoryId)] ?? null}
      applicabilityFor={(name, values) => {
        const categoryId = Number(values.categoryId);
        const group = categoryGroups[categoryId];
        const kind = categoryKinds[categoryId] ?? "other";
        if (!group) return null;
        if (["barrelFilledOn", "bottledOn", "isNas"].includes(name) && isAgaveKind(kind)) return "Not used for tequila or mezcal";
        if (["barrelFilledOn", "bottledOn", "ageStatement"].includes(name) && isGinKind(kind)) return "Not used for gin";
        if (name === "ginStyle" && kind !== "gin") return "Only for gin styles";
        if (name === "isAgedGin" && !isGinKind(kind)) return "Only for gin";
        if (["ageYears", "ageMonths", "ageDays", "isNas", "finishLinks"].includes(name) && isGinKind(kind) && values.isAgedGin !== true) return "Only for aged gin";
        if (name === "tequilaClass" && kind !== "tequila") return "Only for tequila";
        if (name === "brandyGrade" && !BRANDY_MINIMUM_YEARS[kind]) return "No defined grade for this category";
        if (name === "ageStatement" && kind === "tequila") return "Class supplies the statement";
        if (["ageYears", "ageMonths", "ageDays"].includes(name) && kind === "tequila" && values.tequilaClass === "blanco") return "Blanco has no age field";
        if (name === "ingredientLinks" && !["agave", "rum", "brandy", "gin"].includes(group)) return "This spirit uses mashbills";
        if (name === "mashbillLinks" && ["agave", "rum", "brandy", "gin"].includes(group)) return "This spirit uses ingredients";
        return null;
      }}
      onChanged={(prev, next, name) => name === "categoryId" ? { ...withAgeDefaults(prev, next, name), tequilaClass: "", brandyGrade: "", ginStyle: "", isAgedGin: false, ingredientLinks: [] } : withAgeDefaults(prev, next, name)}
      save={saveExpressionsBulkAction}
      noun="label"
      storageKey="rickhouse:bulk-labels:hidden"
    />
  );
}
