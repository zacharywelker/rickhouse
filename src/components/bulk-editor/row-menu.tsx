"use client";

import * as React from "react";
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import type { MenuItem, MenuItemId } from "@/lib/bulk-editor/row-menu";

/**
 * The right-click menu on a row. An item with no handler is not drawn (so an item whose feature has not shipped never
 * appears), and a separator is drawn between the groups that are left.
 */
export function RowMenuContent({ items, handlers, onCloseAutoFocus }: { items: MenuItem[]; handlers: Partial<Record<MenuItemId, () => void>>; onCloseAutoFocus: (event: Event) => void }) {
  const shown = items.filter((item) => handlers[item.id]);
  return (
    <ContextMenuContent onCloseAutoFocus={onCloseAutoFocus}>
      {shown.map((item, index) => (
        <React.Fragment key={item.id}>
          {index > 0 && shown[index - 1]!.group !== item.group ? <ContextMenuSeparator /> : null}
          <ContextMenuItem danger={item.danger} disabled={item.disabled !== undefined} title={item.disabled} onSelect={() => handlers[item.id]?.()}>
            <span>{item.label}</span>
            {item.hint ? <span className="text-xs opacity-80">{item.hint}</span> : null}
          </ContextMenuItem>
        </React.Fragment>
      ))}
    </ContextMenuContent>
  );
}
