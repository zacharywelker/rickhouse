export const DEFAULT_CURRENCY = "USD";

/** Symbol and name for each currency a person can pick. Display only; no conversion. */
export const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US dollar" },
  { code: "CAD", symbol: "CA$", name: "Canadian dollar" },
  { code: "AUD", symbol: "A$", name: "Australian dollar" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand dollar" },
  { code: "GBP", symbol: "£", name: "British pound" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "CHF", symbol: "CHF ", name: "Swiss franc" },
  { code: "SEK", symbol: "kr ", name: "Swedish krona" },
  { code: "NOK", symbol: "kr ", name: "Norwegian krone" },
  { code: "DKK", symbol: "kr ", name: "Danish krone" },
  { code: "JPY", symbol: "¥", name: "Japanese yen" },
  { code: "CNY", symbol: "CN¥", name: "Chinese yuan" },
  { code: "HKD", symbol: "HK$", name: "Hong Kong dollar" },
  { code: "SGD", symbol: "S$", name: "Singapore dollar" },
  { code: "INR", symbol: "₹", name: "Indian rupee" },
  { code: "KRW", symbol: "₩", name: "South Korean won" },
  { code: "MXN", symbol: "MX$", name: "Mexican peso" },
  { code: "BRL", symbol: "R$", name: "Brazilian real" },
  { code: "ZAR", symbol: "R", name: "South African rand" },
] as const;

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as [string, ...string[]];

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? `${code} `;
}
