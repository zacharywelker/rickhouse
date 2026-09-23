"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { groupBottles, groups } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { deleteStoredImage } from "@/lib/images";
import { resolveSlug } from "@/lib/slug";
import { groupSchema } from "@/lib/groups/schemas";
import type { ActionResult } from "@/lib/admin/types";

function invalid(issues: { path: PropertyKey[]; message: string }[]): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return { ok: false, error: issues[0]?.message ?? "Please check the highlighted fields.", fieldErrors };
}

export async function saveGroupAction(id: number | null, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();

  const parsed = groupSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return invalid(parsed.error.issues);
  const input = parsed.data;

  try {
    if (id === null) {
      // The slug is generated once, from the starting name. Routes key on
      // the numeric id, not the slug, so a later rename can't break a link.
      const slug = await resolveSlug({
        table: groups,
        column: groups.slug,
        idColumn: groups.id,
        requested: null,
        fallbackFrom: input.name,
      });
      const [row] = await db.insert(groups).values({ ...input, slug }).returning({ id: groups.id });
      revalidatePath("/groups");
      return { ok: true, message: "Group created.", createdId: row!.id };
    }

    await db.update(groups).set(input).where(eq(groups.id, id));
    revalidatePath("/groups");
    revalidatePath(`/groups/${id}`);
    return { ok: true, message: "Group saved.", createdId: id };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Group" });
  }
}

export async function deleteGroupAction(id: number): Promise<ActionResult> {
  await requireSession();
  try {
    const [group] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
    if (!group) return { ok: false, error: "That group is already gone." };

    // Bottles cascade in the database; the cover image file does not.
    await db.delete(groups).where(eq(groups.id, id));
    if (group.coverImagePath) await deleteStoredImage(group.coverImagePath, null);

    revalidatePath("/groups");
    return { ok: true, message: "Group deleted." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Group" });
  }
}

export async function removeGroupCoverAction(id: number): Promise<ActionResult> {
  await requireSession();
  try {
    const [group] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
    if (!group) return { ok: false, error: "That group is already gone." };

    await db.update(groups).set({ coverImagePath: null }).where(eq(groups.id, id));
    if (group.coverImagePath) await deleteStoredImage(group.coverImagePath, null);

    revalidatePath("/groups");
    revalidatePath(`/groups/${id}`);
    return { ok: true, message: "Cover image removed." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Group" });
  }
}

/**
 * Toggles one bottle's membership in one group. Used both from the group
 * page (adding several bottles) and the bottle detail page (adding a bottle
 * to several groups), so it stays keyed on the pair rather than a batch.
 */
export async function setBottleGroupMembershipAction(
  bottleId: number,
  groupId: number,
  member: boolean,
): Promise<ActionResult> {
  await requireSession();
  try {
    const [group] = await db.select({ id: groups.id }).from(groups).where(eq(groups.id, groupId)).limit(1);
    if (!group) return { ok: false, error: "That group is gone." };

    if (member) {
      const [{ nextPosition } = { nextPosition: 0 }] = await db
        .select({ nextPosition: sql<number>`coalesce(max(${groupBottles.position}), -1)::int + 1` })
        .from(groupBottles)
        .where(eq(groupBottles.groupId, groupId));
      await db
        .insert(groupBottles)
        .values({ groupId, bottleId, position: nextPosition })
        .onConflictDoNothing();
    } else {
      await db.delete(groupBottles).where(and(eq(groupBottles.groupId, groupId), eq(groupBottles.bottleId, bottleId)));
    }

    revalidatePath(`/groups/${groupId}`);
    revalidatePath("/groups");
    revalidatePath(`/bottles/${bottleId}`);
    return { ok: true, message: member ? "Added to group." : "Removed from group." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Group" });
  }
}
