import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { groups } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { ImageError, deleteStoredImage, storeGroupCoverImage } from "@/lib/images";
import type { ActionResult } from "@/lib/admin/types";

/**
 * A route handler rather than a Server Action, for the same reason as
 * bottles/[id]/images: Next.js 15.5's Server Action path can silently drop
 * multipart file data when middleware is present, and this app's auth
 * middleware matches every route.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse<ActionResult>> {
  const user = await requireSession();

  const { id } = await params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId)) {
    return NextResponse.json({ ok: false, error: "That group is gone." }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("cover");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "No image was selected." });
  }

  try {
    const [existing] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.ownerId, user.id)))
      .limit(1);
    if (!existing) return NextResponse.json({ ok: false, error: "That group is gone." }, { status: 404 });

    const stored = await storeGroupCoverImage(file);
    await db
      .update(groups)
      .set({ coverImagePath: stored.filePath })
      .where(and(eq(groups.id, groupId), eq(groups.ownerId, user.id)));

    if (existing.coverImagePath) await deleteStoredImage(existing.coverImagePath, null);

    revalidatePath(`/groups/${existing.slug}`);
    revalidatePath("/groups");
    return NextResponse.json({ ok: true, message: "Cover image set." });
  } catch (error: unknown) {
    if (error instanceof ImageError) return NextResponse.json({ ok: false, error: error.message });
    return NextResponse.json(mapDbError(error, { singular: "Group" }));
  }
}
