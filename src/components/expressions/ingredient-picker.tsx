"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ingredientOptionsAction } from "@/app/(app)/expressions/actions";
import type { IngredientKind } from "@/db/schema";
import { ingredientAllowed, type IngredientChoice } from "@/lib/expressions/spirit-details";
import type { CategoryKind } from "@/lib/expressions/rules";
import { X } from "lucide-react";
import { GIN_BASES, GIN_BOTANICALS } from "@/lib/expressions/gin-details";
import { isGinKind } from "@/lib/expressions/gin-details";

const STANDARD_BASES = ["Molasses", "Sugarcane", "Honey"];
const labelFor = (kind: IngredientKind) => kind === "maguey" ? "Magueys" : kind === "distillate" ? "Distillate" : kind === "botanical" ? "Botanicals" : kind === "flavor" ? "Flavors" : kind === "vodka_base" || kind === "liqueur_base" ? "Base Ingredients" : "Base";

export function IngredientPicker({ kind, categoryKind, value, onChange, hiddenName = "ingredientLinks" }: {
  kind: IngredientKind;
  categoryKind: CategoryKind | null;
  value: IngredientChoice[];
  onChange: (value: IngredientChoice[]) => void;
  hiddenName?: string | null;
}) {
  const [known, setKnown] = React.useState<IngredientChoice[]>([]);
  const [text, setText] = React.useState("");
  const [family, setFamily] = React.useState("grape");
  const [customBase, setCustomBase] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    void ingredientOptionsAction(kind).then((items) => { if (live) setKnown(items); }).catch(() => {});
    return () => { live = false; };
  }, [kind]);

  const selected = categoryKind === "tequila" ? [{ name: "Blue Weber", kind: "maguey" as const }]
    : kind === "botanical" && isGinKind(categoryKind) ? [{ name: "Juniper", kind: "botanical" as const }, ...value.filter((item) => item.kind === "botanical" && item.name.toLocaleLowerCase() !== "juniper")]
    : value.filter((item) => (!item.kind || item.kind === kind) && ingredientAllowed(categoryKind, item));
  const presets = kind === "rum_base" ? STANDARD_BASES : kind === "botanical" && isGinKind(categoryKind) ? GIN_BOTANICALS : kind === "gin_base" ? GIN_BASES : kind === "vodka_base" ? ["Wheat", "Rye", "Potato", "Corn", "Grape"] : [];
  const suggestions = [...presets.map((name): IngredientChoice => ({ name, kind })), ...known]
    .filter((item, index, all) => ingredientAllowed(categoryKind, item) && all.findIndex((candidate) => candidate.name.toLocaleLowerCase() === item.name.toLocaleLowerCase()) === index);
  const add = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 120) return;
    const existing = suggestions.find((item) => item.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
    const item: IngredientChoice = { ...(existing ?? { name: trimmed, kind, ...(kind === "distillate" ? {
      family: categoryKind === "calvados" ? (family === "pear" ? "pear" : "apple") : categoryKind === "cognac" || categoryKind === "armagnac" ? "grape" : family,
    } : {}) }), isManual: true };
    if (!ingredientAllowed(categoryKind, item)) return;
    if (selected.some((row) => row.name.toLocaleLowerCase() === item.name.toLocaleLowerCase())) {
      onChange(selected.map((row) => row.name.toLocaleLowerCase() === item.name.toLocaleLowerCase() ? { ...row, isManual: true } : row));
      setText("");
      return;
    }
    onChange([...selected, item]);
    setText("");
    setCustomBase(false);
  };

  return (
    <fieldset className="flex flex-col gap-3 border border-border p-4">
      <legend className="px-1 text-sm font-medium">{labelFor(kind)}</legend>
      {categoryKind === "tequila" ? (
        <p className="text-sm">Blue Weber <span className="text-muted-foreground">· fixed for tequila</span></p>
      ) : (
        <>
          {selected.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {selected.map((item) => (
                <li key={item.name} className="flex items-center gap-2 border border-border px-2 py-1 text-sm">
                  {item.name}{item.family ? <span className="text-xs text-muted-foreground">{item.family}</span> : null}
                  {item.isManual === false ? <span className="text-xs text-muted-foreground">from style</span> : !(kind === "botanical" && isGinKind(categoryKind) && item.name.toLocaleLowerCase() === "juniper") ? <button type="button" aria-label={`Remove ${item.name}`} onClick={() => onChange(selected.filter((row) => row.name !== item.name))}><X className="size-3" aria-hidden="true" /></button> : <span className="text-xs text-muted-foreground">fixed</span>}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">None selected.</p>}
          {kind === "distillate" ? (
            <label className="text-sm">Fruit
              <select className="ml-2 border border-input bg-background px-2 py-1" value={categoryKind === "calvados" && family === "grape" ? "apple" : categoryKind === "cognac" || categoryKind === "armagnac" ? "grape" : family}
                disabled={categoryKind === "cognac" || categoryKind === "armagnac"}
                onChange={(event) => setFamily(event.target.value)}>
                {(categoryKind === "calvados" ? ["apple", "pear"] : ["grape", "apple", "pear", "other"]).map((item) => <option key={item} value={item}>{item[0]!.toUpperCase() + item.slice(1)}</option>)}
              </select>
            </label>
          ) : null}
          {kind === "rum_base" && !customBase ? (
            <div className="flex flex-wrap gap-2">
              {STANDARD_BASES.map((base) => <Button key={base} type="button" size="sm" variant="outline" onClick={() => add(base)}>{base}</Button>)}
              <Button type="button" size="sm" variant="outline" onClick={() => setCustomBase(true)}>Other…</Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Input aria-label={`Add ${labelFor(kind).toLowerCase()}`} list={`ingredient-${kind}-suggestions`} value={text} onChange={(event) => setText(event.target.value)}
                placeholder={kind === "maguey" ? "Espadín, Tobalá…" : kind === "rum_base" ? "Name the other base" : kind === "botanical" ? "Search or add a botanical" : kind === "gin_base" ? "Search or add a base" : "Apple, Ugni Blanc…"} className="max-w-xs" />
              <datalist id={`ingredient-${kind}-suggestions`}>{suggestions.map((item) => <option key={item.name} value={item.name} />)}</datalist>
              <Button type="button" size="sm" onClick={() => add(text)}>Add</Button>
            </div>
          )}
          {(kind === "botanical" || kind === "gin_base") && text.trim() ? (
            <div className="flex flex-wrap gap-2">{suggestions.filter((item) => item.name.toLocaleLowerCase().includes(text.trim().toLocaleLowerCase()) && !selected.some((row) => row.name.toLocaleLowerCase() === item.name.toLocaleLowerCase())).slice(0, 12).map((item) => <Button key={item.name} type="button" size="sm" variant="outline" onClick={() => add(item.name)}>{item.name}</Button>)}</div>
          ) : null}
        </>
      )}
      {hiddenName ? <input type="hidden" name={hiddenName} value={JSON.stringify(selected)} /> : null}
    </fieldset>
  );
}
