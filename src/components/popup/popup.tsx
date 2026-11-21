"use client";

import * as React from "react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { nextOf, POPUP_SAVED_EVENT, stepOf, type PopupSaved } from "@/lib/bulk-editor/popup-nav";

/**
 * What a form in the bulk editor's popup tells the popup. `usePopup()` is null on a full page, where a form behaves as
 * it always has. A form that is redesigned keeps calling this for "saved" and "cancel", so the popup keeps working.
 */
export type PopupApi = { saved: (result: PopupSaved) => void; close: () => void };

const PopupContext = React.createContext<PopupApi | null>(null);
export const usePopup = (): PopupApi | null => React.useContext(PopupContext);

/**
 * Choosing in a picker, flipping a switch or clearing a choice changes the form without an `input` event (typing and
 * ticking do fire one), so these are recognised by what was clicked. A click on one that changes nothing asks needlessly,
 * which costs a click; missing a change would lose it.
 */
const CHANGES_THE_FORM = '[cmdk-item], [role="switch"], [role="checkbox"], [role="radio"], [aria-label="Clear selection"]';
const changesForm = (target: EventTarget): boolean => target instanceof Element && target.closest(CHANGES_THE_FORM) !== null;

/**
 * The real label and bottle pages, shown in a large dialog over the bulk editor (the `@modal` slot renders them through
 * intercepting routes). Closing it with something typed in the form asks first, however it is closed.
 */
export function PopupFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const step = stepOf(search);
  const next = nextOf(search);
  // Typing is remembered against the step it happened in, so a new step starts clean.
  const stepKey = `${pathname}?${search.toString()}`;
  const [typedIn, setTypedIn] = React.useState<string | null>(null);
  const dirty = typedIn === stepKey;
  const [asking, setAsking] = React.useState(false);

  const close = React.useCallback(() => {
    if (dirty) setAsking(true);
    else router.back();
  }, [dirty, router]);

  const api = React.useMemo<PopupApi>(
    () => ({
      close,
      saved: (result) => {
        if (next) {
          router.replace(next as Route);
          return;
        }
        window.dispatchEvent(new CustomEvent<PopupSaved>(POPUP_SAVED_EVENT, { detail: result }));
        router.refresh();
        router.back();
      },
    }),
    [close, next, router],
  );

  return (
    <PopupContext.Provider value={api}>
      <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent className="max-w-4xl" onInput={() => setTypedIn(stepKey)} onClick={(event) => { if (changesForm(event.target)) setTypedIn(stepKey); }} onKeyDown={(event) => { if (event.key === "Enter" && (event.target as Element).closest?.("[cmdk-root]")) setTypedIn(stepKey); }} data-popup>
          {step ? (
            <DialogHeader className="px-6 py-3">
              <DialogTitle className="text-base">Step {step.step} of {step.of}</DialogTitle>
              <DialogDescription className="sr-only">Finish this step to go on.</DialogDescription>
            </DialogHeader>
          ) : (
            <>
              <DialogTitle className="sr-only">Record</DialogTitle>
              <DialogDescription className="sr-only">Edit this record.</DialogDescription>
            </>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
        </DialogContent>
      </Dialog>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Discard what you entered?</DialogTitle>
            <DialogDescription>Nothing you typed here has been saved.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAsking(false)}>
              Keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setAsking(false);
                router.back();
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PopupContext.Provider>
  );
}
