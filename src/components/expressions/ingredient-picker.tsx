"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ingredientOptionsAction } from "@/app/(app)/expressions/actions";
import type { IngredientKind } from "@/db/schema";
import { ingredientAllowed, type IngredientChoice } from "@/lib/expressions/spirit-details";
import type { CategoryKind } from "@/lib/expressions/rules";
import { X } from "lucide-react";
import { BRANDY_FRUITS, fruitFamily, GIN_BASES, GIN_BOTANICALS, RUM_BASES, VODKA_BASES } from "@/lib/expressions/ingredient-presets";
import { isGinKind } from "@/lib/expressions/gin-details";

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
  const [rejected, setRejected] = React.useState<string | null>(null);
  const [customBase, setCustomBase] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    void ingredientOptionsAction(kind).then((items) => { if (live) setKnown(items); }).catch(() => {});
    return () => { live = false; };
  }, [kind]);

  const selected = categoryKind === "tequila" ? [{ name: "Blue Weber", kind: "maguey" as const }]
    : kind === "botanical" && isGinKind(categoryKind) ? [{ name: "Juniper", kind: "botanical" as const }, ...value.filter((item) => item.kind === "botanical" && item.name.toLocaleLowerCase() !== "juniper")]
    : value.filter((item) => (!item.kind || item.kind === kind) && ingredientAllowed(categoryKind, item));
  const presets = kind === "rum_base" ? RUM_BASES : kind === "botanical" && isGinKind(categoryKind) ? GIN_BOTANICALS : kind === "gin_base" ? GIN_BASES : kind === "vodka_base" ? VODKA_BASES : [];
  const presetChoices: IngredientChoice[] = kind === "distillate"
    ? Object.entries(BRANDY_FRUITS).map(([name, family]) => ({ name, kind, family }))
    : presets.map((name): IngredientChoice => ({ name, kind }));
  const suggestions = [...presetChoices, ...known]
    .filter((item, index, all) => ingredientAllowed(categoryKind, item) && all.findIndex((candidate) => candidate.name.toLocaleLowerCase() === item.name.toLocaleLowerCase()) === index);
  const add = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 120) return;
    setRejected(null);
    const existing = suggestions.find((item) => item.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
    // A fruit's family comes from its name, so several fruits of different families can sit on one label.
    const item: IngredientChoice = { ...(existing ?? { name: trimmed, kind, ...(kind === "distillate" ? { family: fruitFamily(categoryKind, trimmed) } : {}) }), isManual: true };
    if (!ingredientAllowed(categoryKind, item)) {
      setRejected(categoryKind === "calvados" ? `${trimmed} can't be a Calvados base: it is made from apples or pears.` : `${trimmed} can't be a ${categoryKind === "armagnac" ? "Armagnac" : "Cognac"} base: it is made from grapes.`);
      return;
    }
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
          {kind === "rum_base" && !customBase ? (
            <div className="flex flex-wrap gap-2">
              {RUM_BASES.map((base) => <Button key={base} type="button" size="sm" variant="outline" onClick={() => add(base)}>{base}</Button>)}
              <Button type="button" size="sm" variant="outline" onClick={() => setCustomBase(true)}>Other…</Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Input aria-label={`Add ${labelFor(kind).toLowerCase()}`} list={`ingredient-${kind}-suggestions`} value={text} onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add(text); } }}
                placeholder={kind === "maguey" ? "Espadín, Tobalá…" : kind === "rum_base" ? "Name the other base" : kind === "botanical" ? "Search or add a botanical" : kind === "gin_base" ? "Search or add a base" : kind === "distillate" ? "Type a fruit — Ugni Blanc, Apple, Apricot…" : "Apple, Ugni Blanc…"} className="max-w-xs" />
              <datalist id={`ingredient-${kind}-suggestions`}>{suggestions.map((item) => <option key={item.name} value={item.name} />)}</datalist>
              <Button type="button" size="sm" onClick={() => add(text)}>Add</Button>
            </div>
          )}
          {rejected ? <p role="alert" className="text-sm text-destructive">{rejected}</p> : null}
          {(kind === "botanical" || kind === "gin_base") && text.trim() ? (
            <div className="flex flex-wrap gap-2">{suggestions.filter((item) => item.name.toLocaleLowerCase().includes(text.trim().toLocaleLowerCase()) && !selected.some((row) => row.name.toLocaleLowerCase() === item.name.toLocaleLowerCase())).slice(0, 12).map((item) => <Button key={item.name} type="button" size="sm" variant="outline" onClick={() => add(item.name)}>{item.name}</Button>)}</div>
          ) : null}
        </>
      )}
      {hiddenName ? <input type="hidden" name={hiddenName} value={JSON.stringify(selected)} /> : null}
    </fieldset>
  );
}
