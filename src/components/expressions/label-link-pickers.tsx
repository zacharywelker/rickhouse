"use client";

import * as React from "react";
import type { FieldGroup } from "@/db/schema";
import type { Option } from "@/lib/admin/types";
import { effectiveRows, totalsOf } from "@/lib/expressions/finish-picker-model";
import { isGinKind } from "@/lib/expressions/gin-details";
import type { CategoryKind } from "@/lib/expressions/rules";
import { countryForDistillery, isAgaveKind, type IngredientChoice } from "@/lib/expressions/spirit-details";
import { FinishPicker } from "./finish-picker";
import { IngredientPicker } from "./ingredient-picker";
import { OrderedPicker, serializeLinks, type LinkedRow } from "./ordered-picker";

/**
 * A label's distilleries, ingredients, mashbills and finishes, as the label form edits them. They are here, and not in
 * the form, so the bulk editor's cells open exactly these (same pickers, same rules for which spirit gets which, same
 * messages) and the two cannot drift apart. The form renders all four in this order; a cell renders one.
 */
export type LabelLinks = { distilleries: LinkedRow[]; mashbills: LinkedRow[]; finishes: LinkedRow[]; ingredients?: IngredientChoice[] };

type Common = {
  fieldGroup: FieldGroup;
  kind: CategoryKind | null;
  links: LabelLinks;
  onLinksChange: (next: LabelLinks) => void;
};

/** Cask-type spirits list known casks without an order or a duration. */
const CASK_TYPE_KINDS = ["canadian", "irish", "scotch", "amaro", "liqueur", "chocolate-liqueur", "cream-liqueur"];

/** Linking a distillery can bring its region and origin along, so its changes go through `changeLinks`. */
export function DistilleryPicker({ fieldGroup, kind, options, links, changeLinks }: Omit<Common, "onLinksChange"> & { options: Option[]; changeLinks: (next: LabelLinks) => void }) {
  return (
    <OrderedPicker
      name="distilleryLinks"
      label={fieldGroup === "rum" ? "Distilleries / Estates" : "Distilleries"}
      description="Every distillery that contributed, in the order you would list them. Tick Inferred when the label does not name it and you worked it out elsewhere."
      resource="distilleries"
      options={options.filter((option) => !option.country || countryForDistillery(kind, option.country))}
      {...(isAgaveKind(kind) ? { defaultCountry: "Mexico" } : kind === "cognac" || kind === "armagnac" || kind === "calvados" ? { defaultCountry: "France" } : kind === "pisco" ? { defaultCountry: "Peru" } : kind === "canadian" ? { defaultCountry: "Canada" } : kind === "irish" ? { defaultCountry: "Ireland" } : {})}
      amountLabel="Share"
      amountSuffix="%"
      amountMax={100}
      inferable
      undisclosable
      value={links.distilleries}
      onChange={(rows) => changeLinks({ ...links, distilleries: rows })}
      chosenMashbillIds={new Set(links.mashbills.map((m) => m.id))}
      onSuggestMashbill={(row) => changeLinks({ ...links, mashbills: [...links.mashbills, row] })}
    />
  );
}

export function IngredientPickers({ fieldGroup, kind, links, onLinksChange }: Common) {
  const chosen = links.ingredients ?? [];
  const only = (name: string) => (selected: IngredientChoice[]) => onLinksChange({ ...links, ingredients: [...chosen.filter((item) => item.kind !== name), ...selected] });
  if (fieldGroup === "gin" && isGinKind(kind)) {
    return (
      <>
        <IngredientPicker kind="botanical" categoryKind={kind} value={chosen} hiddenName={null} onChange={only("botanical")} />
        <IngredientPicker kind="gin_base" categoryKind={kind} value={chosen} hiddenName={null} onChange={only("gin_base")} />
        <input type="hidden" name="ingredientLinks" value={JSON.stringify(chosen)} />
        <input type="hidden" name="mashbillLinks" value={serializeLinks(links.mashbills)} />
      </>
    );
  }
  if (fieldGroup === "vodka" || fieldGroup === "amaro" || fieldGroup === "liqueur") {
    return (
      <>
        {fieldGroup === "vodka" ? <IngredientPicker kind="vodka_base" categoryKind={kind} value={chosen} hiddenName={null} onChange={only("vodka_base")} /> : null}
        {fieldGroup === "amaro" ? <IngredientPicker kind="botanical" categoryKind={kind} value={chosen} hiddenName={null} onChange={only("botanical")} /> : null}
        {fieldGroup === "liqueur" ? <IngredientPicker kind="liqueur_base" categoryKind={kind} value={chosen} hiddenName={null} onChange={only("liqueur_base")} /> : null}
        {fieldGroup === "liqueur" || kind === "flavored-vodka" ? <IngredientPicker kind="flavor" categoryKind={kind} value={chosen} hiddenName={null} onChange={only("flavor")} /> : null}
        <input type="hidden" name="ingredientLinks" value={JSON.stringify(chosen)} />
      </>
    );
  }
  if (fieldGroup === "agave" || fieldGroup === "rum" || fieldGroup === "brandy") {
    return (
      <IngredientPicker
        kind={fieldGroup === "agave" ? "maguey" : fieldGroup === "rum" ? "rum_base" : "distillate"}
        categoryKind={kind}
        value={chosen}
        onChange={(ingredients) => onLinksChange({ ...links, ingredients })}
      />
    );
  }
  return null;
}

export function MashbillPicker({ fieldGroup, singleMalt, categoryName, options, links, onLinksChange }: Common & { singleMalt: boolean; categoryName: string | undefined; options: Option[] }) {
  if (fieldGroup === "gin") return null;
  if (fieldGroup === "rum" || fieldGroup === "agave" || fieldGroup === "brandy" || fieldGroup === "vodka" || fieldGroup === "amaro" || fieldGroup === "liqueur") {
    // Older mashbill links remain stored while the relevant spirit uses ingredients.
    return <input type="hidden" name="mashbillLinks" value={serializeLinks(links.mashbills)} />;
  }
  if (singleMalt) {
    return (
      <>
        <div className="border border-border p-4">
          <p className="text-sm font-medium">Mashbill</p>
          <p className="mt-1 text-sm text-muted-foreground">100% Malted Barley</p>
        </div>
        <input type="hidden" name="mashbillLinks" value={serializeLinks(links.mashbills)} />
      </>
    );
  }
  // Once every finish share is filled and adds to 100, each mashbill's share is their sum and is not typed.
  const pairTotals = totalsOf(links.finishes, links.mashbills.map((row) => row.id));
  const lockedMashbillShares = pairTotals.started && !pairTotals.error && Object.keys(pairTotals.mashbillShares).length > 0
    ? Object.fromEntries(Object.entries(pairTotals.mashbillShares).map(([id, share]) => [id, String(share)]))
    : undefined;
  return (
    <>
      {categoryName === "Pot Still Irish Whiskey" ? <p className="text-sm text-muted-foreground">Category grains: malted and unmalted barley, at least 30% each. Link a recipe only for disclosed details; its undisclosed share can stay unknown.</p> :
        categoryName === "Malt Irish Whiskey" || categoryName === "Single Malt Scotch Whisky" ? <p className="text-sm text-muted-foreground">Category grains: 100% malted barley. A linked recipe is optional.</p> : null}
      <OrderedPicker
        name="mashbillLinks"
        label="Mashbills"
        description="One per contributing recipe. A blend of three has three. With more than one distillery above, say which one made each."
        resource={null}
        emptyHint="No mashbills yet — add a new one from here."
        options={options}
        amountLabel="Share"
        amountSuffix="%"
        amountMax={100}
        value={links.mashbills}
        onChange={(rows) => onLinksChange({ ...links, mashbills: rows })}
        distilleryChoices={links.distilleries.map((d) => ({ id: d.id, name: d.label }))}
        {...(lockedMashbillShares ? { lockedAmounts: lockedMashbillShares } : {})}
      />
    </>
  );
}

export function FinishPickers({ kind, shown, options, links, onLinksChange }: Common & { shown: boolean; options: Option[] }) {
  const caskTypes = CASK_TYPE_KINDS.includes(kind ?? "");
  if (!shown) {
    // A hidden picker is not an instruction to erase previously saved casks.
    return <input type="hidden" name="finishLinks" value={serializeLinks(effectiveRows(links.finishes, links.mashbills.map((row) => row.id)))} />;
  }
  return (
    <FinishPicker
      mashbills={links.mashbills}
      finishes={links.finishes}
      name="finishLinks"
      label={caskTypes ? "Cask Types" : "Finishes"}
      description={caskTypes ? "Known casks, without assuming a finishing order or duration." : "In sequence, for a double or triple finish."}
      resource="finishes"
      options={options}
      amountLabel="Months"
      amountSuffix="mo"
      showOrder={!caskTypes}
      showAmount={!caskTypes}
      onChange={(rows) => onLinksChange({ ...links, finishes: rows })}
    />
  );
}
