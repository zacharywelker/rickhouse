import type { FinishType } from "@/db/schema";

export function inferFinishType(name: string): FinishType | null {
  if (/\b(cognac|brandy|armagnac|calvados|rum|tequila|mezcal|whisk|whiskey|whisky)\b/i.test(name)) return "spirit";
  if (/\b(beer|stout|ipa|bock|ale|porter|lager)\b/i.test(name)) return "beer";
  if (/\b(port|sherry|madeira|marsala|oloroso|pedro|px|vermouth|fortified)\b/i.test(name)) return "fortified";
  if (/\b(wine|bordeaux|burgundy|sauternes|rioja|cabernet|merlot|zinfandel|pinot|champagne|naranja)\b/i.test(name)) return "wine";
  if (/\b(oak|wood|cherry|maple|acacia|chestnut|cedar)\b/i.test(name)) return "wood";
  return null;
}
