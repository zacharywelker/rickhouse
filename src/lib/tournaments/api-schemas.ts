import { z } from "zod";
import { isGroupOrder } from "./types";

const id = z.number().int().positive();

/** One entry of a field: one of your bottles, one of your labels with no bottle, or a name typed in. */
export const entryInputSchema = z.union([
  z.object({ bottleId: id }).strict(),
  z.object({ expressionId: id }).strict(),
  z.object({ name: z.string().trim().min(1, "Name the entry.").max(120, "Up to 120 characters.") }).strict(),
]);

const groupOrder = z
  .array(z.string())
  .refine(isGroupOrder, "List proof, mashbill, distillery, age and finish, each once.");

const settingsShape = {
  name: z.string().trim().min(1, "Name the tournament.").max(80, "Up to 80 characters."),
  heatSize: z.number().int().min(2, "A flight holds 2 to 4 bottles.").max(4, "A flight holds 2 to 4 bottles."),
  seeding: z.enum(["similar", "random"]),
  groupOrder,
  blind: z.boolean(),
  fieldNote: z.string().trim().max(200, "Up to 200 characters.").nullable(),
};

/** `POST /tournaments`: a name and heat size are needed; the rest has defaults. */
export const createSchema = z
  .object({
    name: settingsShape.name,
    heatSize: settingsShape.heatSize,
    seeding: settingsShape.seeding.default("similar"),
    groupOrder: groupOrder.default(["proof", "mashbill", "distillery", "age", "finish"]),
    blind: settingsShape.blind.default(false),
    fieldNote: settingsShape.fieldNote.default(null),
    entries: z.array(entryInputSchema).max(500, "A tournament holds up to 500 entries.").default([]),
  })
  .strict();

/** `PATCH /tournaments/:id` (a draft): any of the settings, and/or the whole field. */
export const patchSchema = z
  .object({ ...settingsShape, entries: z.array(entryInputSchema).max(500, "A tournament holds up to 500 entries.") })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Send at least one field to change.");

/** `POST .../result`: the entries best first, by entry id, or for a heat poured blind the glass letters best first. */
export const resultSchema = z.union([
  z.object({ ranking: z.array(id).min(2).max(4) }).strict(),
  z.object({ glasses: z.array(z.enum(["A", "B", "C", "D"])).min(2).max(4) }).strict(),
]);

/** `PUT .../glass`: which letter each entry of a flight is poured into. */
export const glassSchema = z.object({ assign: z.array(z.object({ entryId: id, glass: z.enum(["A", "B", "C", "D"]) }).strict()).min(2).max(4) }).strict();

export const moveSchema = z.object({ toHeatId: id }).strict();

/** `POST .../entries/:id/swap`: trade places with another entry in a different flight. */
export const swapSchema = z.object({ withEntryId: id }).strict();

/** `PATCH .../entries/:id`: match an outside entry to one of your bottles or labels. */
export const promoteSchema = z.union([z.object({ bottleId: id }).strict(), z.object({ expressionId: id }).strict()]);

/** `PATCH .../heats/:id`: name a flight, or clear its name with null or an empty string. */
export const renameSchema = z.object({ label: z.string().max(80, "Up to 80 characters.").nullable() }).strict();

/** `POST .../draw`: no body fields draws a random pending flight; `heatId` opens that pending flight for pouring. */
export const drawSchema = z.object({ heatId: id.optional() }).strict();

/** The commands that carry no data still take a JSON object, which a cross-site form cannot send. */
export const emptySchema = z.object({}).strict();
