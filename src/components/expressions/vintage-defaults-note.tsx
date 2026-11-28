"use client";

import { useMoney } from "@/components/currency-context";
import { vintageDefaultsNote } from "@/lib/expressions/vintage-defaults";

/** Under the vintages editor: what a blank box means, with the label's own values. */
export function VintageDefaultsNote({ label }: { label: Record<string, unknown> }) {
  const money = useMoney();
  const note = vintageDefaultsNote(label, money);
  return note ? <p className="mt-2 text-xs text-muted-foreground">{note}</p> : null;
}
