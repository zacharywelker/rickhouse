"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export type RankItem = { key: string; title: string; detail?: string; label: string };

/**
 * Items in the order you rank them, best first, moved with Up and Down buttons (no dragging). Each button is a 44px
 * target named after its item ("Move X up"). After a move the focus stays on the same item's button, or on the other
 * one when the item reached an end.
 */
export function RankList({ items, onMove, disabled }: { items: RankItem[]; onMove: (index: number, delta: -1 | 1) => void; disabled?: boolean }) {
  const refs = React.useRef(new Map<string, HTMLButtonElement>());
  const focus = React.useRef<{ key: string; delta: -1 | 1 } | null>(null);

  React.useEffect(() => {
    const want = focus.current;
    if (!want) return;
    focus.current = null;
    const index = items.findIndex((i) => i.key === want.key);
    const first = refs.current.get(`${want.key}:${want.delta}`);
    const other = refs.current.get(`${want.key}:${want.delta === -1 ? 1 : -1}`);
    const target = index >= 0 && first && !first.disabled ? first : other;
    target?.focus();
  }, [items]);

  const button = (item: RankItem, index: number, delta: -1 | 1) => {
    const edge = delta === -1 ? index === 0 : index === items.length - 1;
    const Icon = delta === -1 ? ChevronUp : ChevronDown;
    return (
      <Button
        type="button"
        variant="outline"
        className="size-11 p-0"
        aria-label={`Move ${item.label} ${delta === -1 ? "up" : "down"}`}
        disabled={edge || disabled}
        ref={(node) => {
          if (node) refs.current.set(`${item.key}:${delta}`, node);
          else refs.current.delete(`${item.key}:${delta}`);
        }}
        onClick={() => {
          focus.current = { key: item.key, delta };
          onMove(index, delta);
        }}
      >
        <Icon className="size-4" aria-hidden />
      </Button>
    );
  };

  return (
    <ol className="border-b border-border">
      {items.map((item, index) => (
        <li key={item.key} className="flex min-h-14 items-center gap-3 border-t border-border py-1.5">
          <span className="w-6 shrink-0 text-center text-base font-semibold tabular-nums" aria-label={`Place ${index + 1}`}>
            {index + 1}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm leading-snug">{item.title}</span>
            {item.detail ? <span className="text-xs tabular-nums text-muted-foreground">{item.detail}</span> : null}
          </span>
          <span className="flex shrink-0 gap-1">
            {button(item, index, -1)}
            {button(item, index, 1)}
          </span>
        </li>
      ))}
    </ol>
  );
}
