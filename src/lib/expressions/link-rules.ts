import type { FieldGroup } from "@/db/schema";
import { isGinKind } from "./gin-details";
import type { CategoryKind } from "./rules";

/** Whether the spirit has ingredient pickers (botanicals, bases, flavors), as the label form decides it. */
export const hasIngredientPickers = (fieldGroup: FieldGroup, kind: CategoryKind | null) =>
  (fieldGroup === "gin" && isGinKind(kind)) || ["vodka", "amaro", "liqueur", "agave", "rum", "brandy"].includes(fieldGroup);

/** Whether the spirit has a mashbill picker at all: gin and the ingredient spirits do not, and a single malt is always 100% malted barley. */
export const hasMashbillPicker = (fieldGroup: FieldGroup, singleMalt: boolean) =>
  !(fieldGroup === "gin" || fieldGroup === "rum" || fieldGroup === "agave" || fieldGroup === "brandy" || fieldGroup === "vodka" || fieldGroup === "amaro" || fieldGroup === "liqueur" || singleMalt);
