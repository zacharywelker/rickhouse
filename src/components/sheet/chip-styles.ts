/** The shared look of the data sheet's chips (today's tokens): a square bordered chip, a dim label inside, a bold dotted-underlined value. */
export const CHIP = "inline-flex h-8 items-center gap-1.5 border border-input bg-card px-2 text-sm focus-within:ring-2 focus-within:ring-ring";
export const CHIP_LABEL = "text-xs text-muted-foreground";
export const BARE_INPUT =
  "min-w-0 border-0 bg-transparent p-0 text-sm font-medium tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none underline decoration-dotted decoration-muted-foreground underline-offset-4 placeholder:font-normal placeholder:text-muted-foreground placeholder:no-underline";
export const INPUT_WIDTHS: Record<string, string> = { auto: "w-24", xxs: "w-14", xs: "w-20", sm: "w-24", md: "w-36", lg: "w-48" };
