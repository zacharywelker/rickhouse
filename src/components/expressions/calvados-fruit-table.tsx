"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { CALVADOS_FRUIT_ROWS, calvadosTotals, normalizeCalvadosFruit, parseShare, pearNote, shareNote, type IngredientChoice } from "@/lib/expressions/spirit-details";

/**
 * A Calvados's fruit: the four apple types, apples whose type is not stated, and pears, each with a Share (%), then the apples'
 * subtotal and the total. A blank row is not part of the label. Notes, never blocks: a total that is not 100, and the pears the
 * appellation asks for (Pays d'Auge at most 30%, Domfrontais at least 30%).
 */
export function CalvadosFruitTable({ value: saved, onChange, appellation }: { value: IngredientChoice[]; onChange: (next: IngredientChoice[]) => void; appellation: unknown }) {
  // Fruit a phone or an older label named another way is shown as the row it stands for.
  const value = normalizeCalvadosFruit(saved);
  const [text, setText] = React.useState<Record<string, string>>({});
  const shareOf = (name: string) => value.find((row) => row.name === name)?.share ?? null;
  const rows = CALVADOS_FRUIT_ROWS.map((row) => ({ name: row.name, share: shareOf(row.name) }));
  const totals = calvadosTotals(rows);
  const note = shareNote(rows.filter((row) => value.some((v) => v.name === row.name)).map((row) => ({ share: row.share })));
  const pears = pearNote(appellation, totals.pears);
  const set = (name: string, family: "apple" | "pear", raw: string) => {
    setText((prev) => ({ ...prev, [name]: raw }));
    const share = parseShare(raw);
    const others = value.filter((row) => row.name !== name);
    // A row with nothing in it is not saved.
    onChange(raw.trim() === "" ? others : [...others, { name, kind: "distillate", family, share: share ?? null, isManual: true }]);
  };
  const shown = (name: string) => {
    const typed = text[name];
    const share = shareOf(name);
    return typed !== undefined && parseShare(typed) === (share ?? null) ? typed : share === null ? "" : String(share);
  };
  return (
    <fieldset className="flex flex-col gap-3 border border-border p-4">
      <legend className="px-1 text-sm font-medium">Fruit</legend>
      <table className="w-full max-w-md text-sm">
        <tbody>
          {CALVADOS_FRUIT_ROWS.map((row, index) => (
            <React.Fragment key={row.name}>
              {index === 4 ? (
                <tr className="text-muted-foreground"><td className="py-1">Apples (subtotal)</td><td className="py-1 text-right tabular-nums">{totals.apples === null ? "—" : `${totals.apples}%`}</td></tr>
              ) : null}
              <tr>
                <td className="py-1 pr-4"><label htmlFor={`calvados-${row.name}`}>{row.label}</label></td>
                <td className="py-1 text-right">
                  <span className="inline-flex items-center gap-1">
                    <Input
                      id={`calvados-${row.name}`} aria-label={`Share of ${row.label}`} type="number" min={0} max={100} step={0.01} inputMode="decimal" placeholder="—"
                      className="h-8 w-20 px-1.5 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      value={shown(row.name)} onChange={(event) => set(row.name, row.family, event.target.value)}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </span>
                </td>
              </tr>
            </React.Fragment>
          ))}
          <tr className="border-t border-border font-medium"><td className="py-1">Total</td><td className="py-1 text-right tabular-nums">{totals.total === null ? "—" : `${totals.total}%`}</td></tr>
        </tbody>
      </table>
      {note ? <p role="status" className="text-sm text-muted-foreground">{note}</p> : null}
      {pears ? <p role="status" className="text-sm text-muted-foreground">{pears}</p> : null}
      <input type="hidden" name="ingredientLinks" value={JSON.stringify(value)} />
    </fieldset>
  );
}
