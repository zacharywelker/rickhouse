"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SSO_KINDS } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { forgetAuth } from "@/lib/auth/server";
import { mapDbError } from "@/lib/db-errors";
import { GOOGLE_DISCOVERY_URL, createSsoProvider, deleteSsoProvider, updateSsoProvider } from "@/lib/sso/providers";
import type { ActionResult } from "@/lib/admin/types";

const base = z.object({
  name: z.string().trim().min(1, "Give it a name people will recognise.").max(60),
  kind: z.enum(SSO_KINDS),
  discoveryUrl: z.string().trim(),
  clientId: z.string().trim().min(1, "Enter the client ID."),
  clientSecret: z.string().trim(),
  enabled: z.boolean(),
});

function read(formData: FormData) {
  return {
    name: formData.get("name"),
    kind: formData.get("kind"),
    discoveryUrl: formData.get("discoveryUrl") ?? "",
    clientId: formData.get("clientId"),
    clientSecret: formData.get("clientSecret") ?? "",
    enabled: formData.get("enabled") === "on",
  };
}

/** Google's discovery URL is fixed; anything else must be a real https/http URL. */
function discoveryFor(kind: string, url: string): string | null {
  if (kind === "google") return GOOGLE_DISCOVERY_URL;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    // Accept an issuer URL too: most people have that to hand.
    return parsed.pathname.endsWith("/.well-known/openid-configuration")
      ? parsed.toString()
      : `${parsed.toString().replace(/\/+$/, "")}/.well-known/openid-configuration`;
  } catch {
    return null;
  }
}

export async function createSsoAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = base
    .extend({
      providerId: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Use lowercase letters, numbers and dashes, e.g. pocket-id."),
    })
    .safeParse({ ...read(formData), providerId: formData.get("providerId") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const discoveryUrl = discoveryFor(parsed.data.kind, parsed.data.discoveryUrl);
  if (!discoveryUrl) return { ok: false, error: "Enter the provider's issuer or discovery URL." };
  if (!parsed.data.clientSecret) return { ok: false, error: "Enter the client secret." };
  if (parsed.data.providerId === "credential") return { ok: false, error: "That ID is reserved." };

  try {
    await createSsoProvider({ ...parsed.data, discoveryUrl });
  } catch (error: unknown) {
    const mapped = mapDbError(error, { singular: "Provider" });
    return { ok: false, error: mapped.ok ? "Could not save the provider." : mapped.error };
  }
  forgetAuth();
  revalidatePath("/system/sso");
  return { ok: true, message: `${parsed.data.name} added.` };
}

export async function updateSsoAction(id: number, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = base.safeParse(read(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const discoveryUrl = discoveryFor(parsed.data.kind, parsed.data.discoveryUrl);
  if (!discoveryUrl) return { ok: false, error: "Enter the provider's issuer or discovery URL." };
  await updateSsoProvider(id, { ...parsed.data, discoveryUrl, clientSecret: parsed.data.clientSecret || null });
  forgetAuth();
  revalidatePath("/system/sso");
  return { ok: true, message: `${parsed.data.name} saved.` };
}

/** Linked identities stay in the accounts table but can't be used until it's added back. */
export async function deleteSsoAction(id: number): Promise<ActionResult> {
  await requireAdmin();
  await deleteSsoProvider(id);
  forgetAuth();
  revalidatePath("/system/sso");
  return { ok: true, message: "Provider removed." };
}
