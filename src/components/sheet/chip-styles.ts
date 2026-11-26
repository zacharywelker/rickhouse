/**
 * The data sheet's measurements, copied from the mockup (`2026-11-23-add-bottle-redesign/data-sheet.html`): chips 25px high with a
 * 1px ink border, labels dim and values semibold, a dotted underline under a typed value, dashed chips for what is not set. Sizes
 * are in pixels on purpose (the mockup is 13px type; the app's own text scale is not).
 */
export const CHIP = "inline-flex h-[25px] items-center gap-1.5 whitespace-nowrap border border-foreground bg-card px-2 text-[12px] leading-none focus-within:ring-2 focus-within:ring-ring";
export const CHIP_LABEL = "text-muted-foreground";
export const BARE_INPUT =
  "min-w-0 rounded-none border-0 border-b border-dotted border-foreground bg-transparent p-0 text-[12px] font-semibold leading-none text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none placeholder:font-normal placeholder:text-muted-foreground";
/** The boxed text input of the Name row (the mockup's `input.in`). */
export const BOX_INPUT = "h-7 min-w-0 border border-foreground bg-card px-[7px] text-[13px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const ADD_CHIP = "inline-flex h-[25px] items-center whitespace-nowrap border border-dashed border-foreground bg-transparent px-2 text-[12px] leading-none text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const TOGGLE = "inline-flex h-[25px] cursor-pointer select-none items-center gap-[5px] whitespace-nowrap rounded-[13px] border border-foreground px-2.5 text-[12px] leading-none focus-within:ring-2 focus-within:ring-ring";
/** Input widths inside a chip, by the field's width hint (the mockup: 24px for years, 54px for a number, 76px for a statement). */
export const INPUT_WIDTHS: Record<string, string> = { auto: "w-[54px]", xxs: "w-6", xs: "w-[54px]", sm: "w-[54px]", md: "w-[76px]", lg: "w-[130px]" };
