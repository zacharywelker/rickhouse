"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { hasBlocking, type Problem } from "@/lib/admin/popup-problems";

/**
 * The frame every add-details popup shares (add-bottle redesign, section 16): a dialog about 640px wide, a
 * title, a body that scrolls, and a footer that stays in view. Every warning is in that footer, left of Cancel,
 * in one amber style. A blocking problem disables Save; a non-blocking one ends "It will still save."
 */
export function PopupShell({
  title,
  description,
  open,
  onOpenChange,
  problems,
  saveLabel,
  saving = false,
  onSave,
  children,
}: {
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  problems: readonly Problem[];
  saveLabel: string;
  saving?: boolean;
  onSave: () => void;
  children: React.ReactNode;
}) {
  const blocked = hasBlocking(problems);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[640px] gap-0"
        // Enter in a single-line field saves, as it does in the other forms, unless something blocks it.
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (event.key !== "Enter" || target.tagName !== "INPUT" || event.defaultPrevented) return;
          // Enter that confirms an IME candidate, or a held key, is not a request to save.
          if (event.nativeEvent.isComposing || event.repeat) return;
          if (!blocked && !saving) {
            event.preventDefault();
            onSave();
          }
        }}
      >
        <div className="border-b-2 border-foreground px-5 pb-3 pt-5">
          <DialogTitle className="font-display text-2xl leading-tight">{title}</DialogTitle>
          {description ? <DialogDescription className="mt-1">{description}</DialogDescription> : null}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-2">{children}</div>
        <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-5 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1" role="status" aria-live="polite">
            {problems.map((problem) => (
              <p
                key={problem.text}
                className="border border-warning bg-warning/15 px-2 py-1 text-xs leading-snug text-foreground"
              >
                {problem.text}
                {problem.blocking || problem.notice ? null : " It will still save."}
                {problem.action ? (
                  <>
                    {" "}
                    <button type="button" onClick={problem.action.onClick} className="underline underline-offset-2">
                      {problem.action.label}
                    </button>
                  </>
                ) : null}
              </p>
            ))}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={onSave} disabled={blocked || saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saveLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
