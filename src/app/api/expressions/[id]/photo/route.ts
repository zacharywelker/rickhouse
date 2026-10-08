import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { expressions } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { ImageError, deleteStoredImage, storeBottleImage, storeBottleImageBytes } from "@/lib/images";
import { fetchRemoteImage } from "@/lib/remote-image";
import type { ActionResult } from "@/lib/admin/types";

/** A label's photo, uploaded or fetched from a link. A route handler for the same reason as bottles/[id]/images. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse<ActionResult>> {
  const user = await requireSession();

  const { id } = await params;
  const expressionId = Number(id);
  if (!Number.isInteger(expressionId)) {
    return NextResponse.json({ ok: false, error: "That label is gone." }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("photo");
  const link = String(formData.get("imageUrl") ?? "").trim();
  const upload = file instanceof File && file.size > 0 ? file : null;
  if (!upload && link === "") return NextResponse.json({ ok: false, error: "No image was selected." });

  try {
    const [existing] = await db
      .select({ photoPath: expressions.photoPath, photoThumbPath: expressions.photoThumbPath })
      .from(expressions)
      .where(and(eq(expressions.id, expressionId), eq(expressions.ownerId, user.id)))
      .limit(1);
    if (!existing) return NextResponse.json({ ok: false, error: "That label is gone." }, { status: 404 });

    let stored;
    if (upload) stored = await storeBottleImage(upload);
    else {
      const remote = await fetchRemoteImage(link);
      stored = await storeBottleImageBytes(remote.bytes, remote.contentType);
    }
    await db
      .update(expressions)
      .set({ photoPath: stored.filePath, photoThumbPath: stored.thumbPath, photoIsCutout: stored.isCutout })
      .where(and(eq(expressions.id, expressionId), eq(expressions.ownerId, user.id)));
    if (existing.photoPath) await deleteStoredImage(existing.photoPath, existing.photoThumbPath);

    revalidatePath(`/expressions/${expressionId}`);
    return NextResponse.json({ ok: true, message: "Label photo set." });
  } catch (error: unknown) {
    if (error instanceof ImageError) return NextResponse.json({ ok: false, error: error.message });
    return NextResponse.json(mapDbError(error, { singular: "Label" }));
  }
}
