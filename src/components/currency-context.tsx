"use client";

import * as React from "react";
import { DEFAULT_CURRENCY, currencySymbol } from "@/lib/currency";
import { formatMoney } from "@/lib/utils";

const CurrencyContext = React.createContext<string>(DEFAULT_CURRENCY);

/** The signed-in account's currency, for client components that show or take a price. */
export function CurrencyProvider({ currency, children }: { currency: string; children: React.ReactNode }) {
  return <CurrencyContext.Provider value={currency}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): string {
  return React.useContext(CurrencyContext);
}

/** `formatMoney` bound to the account's currency. */
export function useMoney(): (value: string | null | undefined) => string {
  const currency = useCurrency();
  return React.useCallback((value) => formatMoney(value, currency), [currency]);
}

export function useCurrencySymbol(): string {
  return currencySymbol(useCurrency()).trim();
}

/** A number input with the account's currency symbol laid over its start, for price fields. */
export function MoneyAdornment({ children }: { children: React.ReactNode }) {
  const symbol = useCurrencySymbol();
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground"
      >
        {symbol}
      </span>
      {children}
    </div>
  );
}

export function MaybeMoney({ money, children }: { money: boolean; children: React.ReactNode }) {
  return money ? <MoneyAdornment>{children}</MoneyAdornment> : <>{children}</>;
}
