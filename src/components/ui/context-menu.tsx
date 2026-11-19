"use client";

import * as React from "react";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { cn } from "@/lib/utils";

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

/** Square corners, ink border and the flat offset shadow the photo frames use (DESIGN.md §4.2). */
export function ContextMenuContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        className={cn("z-50 min-w-56 border border-foreground bg-card py-1 text-sm shadow-[3px_3px_0_rgb(20_33_61/0.18)] outline-none", className)}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({ className, danger, ...props }: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & { danger?: boolean }) {
  return (
    <ContextMenuPrimitive.Item
      className={cn(
        "flex cursor-default select-none flex-col px-3 py-1.5 outline-none data-[highlighted]:bg-muted data-[disabled]:opacity-45",
        danger && "text-destructive",
        className,
      )}
      {...props}
    />
  );
}

export function ContextMenuSeparator({ className, ...props }: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>) {
  return <ContextMenuPrimitive.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}
