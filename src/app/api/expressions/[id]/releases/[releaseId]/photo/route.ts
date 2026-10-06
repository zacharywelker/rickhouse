import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { expressionReleases } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { ImageError, deleteStoredImage, storeBottleImage, storeBottleImageBytes } from "@/lib/images";
import { fetchRemoteImage } from "@/lib/remote-image";
import { releaseById } from "@/lib/releases-store";
import type { ActionResult } from "@/lib/admin/types";

/** A release's own label photo, uploaded or fetched from a link. Same shape as the label's photo route. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; releaseId: string }> },
): Promise<NextResponse<ActionResult>> {
  const user = await requireSession();

  const { releaseId: raw } = await params;
  const releaseId = Number(raw);
  const gone = NextResponse.json<ActionResult>({ ok: false, error: "That release is gone." }, { status: 404 });
  if (!Number.isInteger(releaseId)) return gone;

  const formData = await request.formData();
  const file = formData.get("photo");
  const link = String(formData.get("imageUrl") ?? "").trim();
  const upload = file instanceof File && file.size > 0 ? file : null;
  if (!upload && link === "") return NextResponse.json({ ok: false, error: "No image was selected." });

  try {
    // Owned through its label; anyone else's release is simply not found.
    const release = await releaseById(releaseId, user.id);
    if (!release) return gone;

    let stored;
    if (upload) stored = await storeBottleImage(upload);
    else {
      const remote = await fetchRemoteImage(link);
      stored = await storeBottleImageBytes(remote.bytes, remote.contentType);
    }
    await db
      .update(expressionReleases)
      .set({ photoPath: stored.filePath, photoThumbPath: stored.thumbPath })
      .where(eq(expressionReleases.id, releaseId));
    if (release.photoPath) await deleteStoredImage(release.photoPath, release.photoThumbPath);

    revalidatePath(`/expressions/${release.expressionId}`);
    revalidatePath(`/expressions/${release.expressionId}/releases/${releaseId}`);
    return NextResponse.json({ ok: true, message: "Release photo set." });
  } catch (error: unknown) {
    if (error instanceof ImageError) return NextResponse.json({ ok: false, error: error.message });
    return NextResponse.json(mapDbError(error, { singular: "Release" }));
  }
}
