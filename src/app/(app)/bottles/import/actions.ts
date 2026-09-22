"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { importBottlesCsv, type ImportReport } from "@/lib/bottles/transfer";

export type ImportState = { report: ImportReport | null; error: string | null };

const MAX_CSV_BYTES = 5 * 1024 * 1024;

export async function importAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireSession();

  const file = formData.get("file");
  const pasted = String(formData.get("pasted") ?? "").trim();

  let text = pasted;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_CSV_BYTES) {
      return { report: null, error: "That file is over 5MB. Split it, or paste the rows instead." };
    }
    text = await file.text();
  }

  if (text.trim() === "") {
    return { report: null, error: "Choose a CSV file, or paste some rows." };
  }

  try {
    const report = await importBottlesCsv(text);
    revalidatePath("/bottles");
    revalidatePath("/expressions");
    revalidatePath("/numbers");
    return { report, error: null };
  } catch (error: unknown) {
    console.error("[rickhouse] import failed", error);
    return { report: null, error: "Could not read that file as CSV." };
  }
}
