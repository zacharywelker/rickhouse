"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { forgetAuth } from "@/lib/auth/server";
import { sendMail } from "@/lib/email/send";
import { deleteSmtpSettings, saveSmtpSettings } from "@/lib/email/settings";
import type { ActionResult } from "@/lib/admin/types";

const smtpSchema = z.object({
  host: z.string().trim().min(1, "Enter the SMTP server."),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().trim().max(200).transform((v) => v || null),
  password: z.string().max(500),
  fromAddress: z.string().trim().min(3, "Enter a From address, e.g. Rickhouse <rickhouse@example.com>."),
});

export async function saveSmtpAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = smtpSchema.safeParse({
    host: formData.get("host"),
    port: formData.get("port"),
    secure: formData.get("secure") === "on",
    username: formData.get("username") ?? "",
    password: formData.get("password") ?? "",
    fromAddress: formData.get("fromAddress"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { password, ...rest } = parsed.data;
  // Blank keeps the saved password, so the form never has to show it.
  await saveSmtpSettings({ ...rest, password: password === "" ? undefined : password });
  forgetAuth();
  revalidatePath("/system/email");
  return { ok: true, message: "Email settings saved." };
}

export async function sendTestEmailAction(): Promise<ActionResult> {
  const me = await requireAdmin();
  try {
    await sendMail({
      to: me.email,
      subject: "Rickhouse test email",
      text: "If you can read this, Rickhouse can send email: password resets, invitations and sign-in codes will work.",
    });
    return { ok: true, message: `Sent to ${me.email}.` };
  } catch (error: unknown) {
    return { ok: false, error: `The mail server said: ${(error as Error).message}` };
  }
}

export async function removeSmtpAction(): Promise<ActionResult> {
  await requireAdmin();
  await deleteSmtpSettings();
  forgetAuth();
  revalidatePath("/system/email");
  return { ok: true, message: "Email turned off." };
}
