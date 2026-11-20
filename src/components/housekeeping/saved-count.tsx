"use client";

import * as React from "react";

/**
 * How many cards on the current page have been saved. A saved card stays on screen but leaves the server's list, so the
 * pager needs the number to step forward by the right amount. The section re-keys the provider for each window, which
 * starts the count again at zero.
 */
const SavedCount = React.createContext<{ saved: number; markSaved: () => void }>({ saved: 0, markSaved: () => {} });

export function SavedCountProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = React.useState(0);
  const value = React.useMemo(() => ({ saved, markSaved: () => setSaved((count) => count + 1) }), [saved]);
  return <SavedCount.Provider value={value}>{children}</SavedCount.Provider>;
}

export const useSavedCount = () => React.useContext(SavedCount);
