import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { bottles } from "@/db/schema";
import { rankSuggestions, type BottleSuggestions } from "./suggestions";

/** Each suggested field's past values on the account's bottles, ranked. Stores' names join Picked By. */
export async function bottleSuggestions(ownerId: number, storeNames: string[] = []): Promise<BottleSuggestions> {
  const column = {
    pickedBy: bottles.pickedBy,
    warehouse: bottles.warehouse,
    rickFloor: bottles.rickFloor,
    location: bottles.location,
  } as const;
  const load = (field: keyof typeof column) =>
    db
      .select({ value: sql<string>`${column[field]}`, count: sql<number>`count(*)::int` })
      .from(bottles)
      .where(and(eq(bottles.ownerId, ownerId), isNotNull(column[field])))
      .groupBy(column[field]);
  const [pickedBy, warehouse, rickFloor, location] = await Promise.all([
    load("pickedBy"),
    load("warehouse"),
    load("rickFloor"),
    load("location"),
  ]);
  return {
    pickedBy: rankSuggestions(pickedBy, storeNames),
    warehouse: rankSuggestions(warehouse),
    rickFloor: rankSuggestions(rickFloor),
    location: rankSuggestions(location),
  };
}
