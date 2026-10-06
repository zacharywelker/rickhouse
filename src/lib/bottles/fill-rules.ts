/** The open/closed rules around a bottle's level. No database here, so they can be tested alone. */
type OpenState = { isOpen: boolean; dateOpened: string | null; status: string };

/**
 * What setting a level changes besides the level. Below full means somebody
 * poured from it, so a sealed bottle is opened on the way: stamped today the
 * first time, and promoted from owned to open, exactly as the Opened tick does.
 */
export function fillUpdate(current: OpenState, fillPct: number, today: string) {
  const opening = fillPct < 100 && !current.isOpen;
  return {
    fillPct,
    ...(opening
      ? {
          isOpen: true,
          ...(current.dateOpened === null ? { dateOpened: today } : {}),
          ...(current.status === "owned" ? { status: "open" as const } : {}),
        }
      : {}),
  };
}
