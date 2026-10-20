import type { BottleStatus, FieldGroup } from "@/db/schema";
import type { CategoryKind } from "@/lib/expressions/rules";

export type ReleaseUnit = "barrel" | "cask" | "lot";

export function effectiveBottleStatus(bottle: { status: BottleStatus; isOpen: boolean; fillPct: number }): BottleStatus {
  return bottle.status === "open" || (bottle.status === "owned" && (bottle.isOpen || bottle.fillPct < 100))
    ? "open"
    : bottle.status;
}

/** Labels for the release unit follow the spirit's regional language. */
export function releaseUnit(fieldGroup: FieldGroup, categoryKind: CategoryKind): ReleaseUnit {
  if (fieldGroup === "agave") return "lot";
  if (fieldGroup === "whiskey" && categoryKind !== "american") return "cask";
  return "barrel";
}
