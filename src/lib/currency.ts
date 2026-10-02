export const DEFAULT_CURRENCY = "USD";

/** Symbol and name for each currency a person can pick. Display only; no conversion. */
export const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US dollar" },
  { code: "CAD", symbol: "$", name: "Canadian dollar" },
  { code: "AUD", symbol: "$", name: "Australian dollar" },
  { code: "NZD", symbol: "$", name: "New Zealand dollar" },
  { code: "GBP", symbol: "£", name: "British pound" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "CHF", symbol: "CHF ", name: "Swiss franc" },
  { code: "SEK", symbol: "kr ", name: "Swedish krona" },
  { code: "NOK", symbol: "kr ", name: "Norwegian krone" },
  { code: "DKK", symbol: "kr ", name: "Danish krone" },
  { code: "JPY", symbol: "¥", name: "Japanese yen" },
  { code: "CNY", symbol: "¥", name: "Chinese yuan" },
  { code: "HKD", symbol: "$", name: "Hong Kong dollar" },
  { code: "SGD", symbol: "$", name: "Singapore dollar" },
  { code: "INR", symbol: "₹", name: "Indian rupee" },
  { code: "KRW", symbol: "₩", name: "South Korean won" },
  { code: "MXN", symbol: "$", name: "Mexican peso" },
  { code: "BRL", symbol: "R$", name: "Brazilian real" },
  { code: "ZAR", symbol: "R", name: "South African rand" },
] as const;

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as [string, ...string[]];

/** Currencies with no minor unit: shown as whole numbers. */
const WHOLE_UNIT = new Set(["JPY", "KRW"]);

export function currencyDecimals(code: string): number {
  return WHOLE_UNIT.has(code) ? 0 : 2;
}

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? `${code} `;
}
