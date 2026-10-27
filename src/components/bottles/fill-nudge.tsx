"use client";

import * as React from "react";

/**
 * "How much is left?" after a new tasting from an owned bottle. The note form
 * and the fill control are siblings on the bottle page, so they meet here: the
 * form starts the nudge, the control shows it and clears it. It carries no
 * level of its own and suggests nothing; the owner moves the dial or says Done.
 */
type FillNudge = { active: boolean; start: () => void; dismiss: () => void };

const NO_NUDGE: FillNudge = { active: false, start: () => {}, dismiss: () => {} };

const FillNudgeContext = React.createContext<FillNudge>(NO_NUDGE);

export function FillNudgeProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = React.useState(false);
  const start = React.useCallback(() => setActive(true), []);
  const dismiss = React.useCallback(() => setActive(false), []);
  const value = React.useMemo(() => ({ active, start, dismiss }), [active, start, dismiss]);
  return <FillNudgeContext.Provider value={value}>{children}</FillNudgeContext.Provider>;
}

/** Outside a provider the nudge never shows, so the pieces still work on their own. */
export function useFillNudge(): FillNudge {
  return React.useContext(FillNudgeContext);
}
