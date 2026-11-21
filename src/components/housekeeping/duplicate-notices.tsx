"use client";

import * as React from "react";

/**
 * What the owner just did in the Duplicates section ("Merged X into Y. 3 labels moved."). A merged pair's card
 * leaves the list at once, so its message is kept here, above the cards, where it survives the refresh.
 */
const Notices = React.createContext<{ notices: string[]; add: (message: string) => void }>({ notices: [], add: () => {} });

export function DuplicateNoticesProvider({ children }: { children: React.ReactNode }) {
  const [notices, setNotices] = React.useState<string[]>([]);
  const value = React.useMemo(() => ({ notices, add: (message: string) => setNotices((all) => [message, ...all].slice(0, 5)) }), [notices]);
  return <Notices.Provider value={value}>{children}</Notices.Provider>;
}

export const useDuplicateNotices = () => React.useContext(Notices);

export function DuplicateNoticeList() {
  const { notices } = useDuplicateNotices();
  if (notices.length === 0) return null;
  return (
    <ul className="mb-4 flex flex-col gap-1">
      {notices.map((message, index) => (
        <li key={`${index}-${message}`} role={index === 0 ? "status" : undefined} className="border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
          {message}
        </li>
      ))}
    </ul>
  );
}
