import "server-only";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { env } from "@/lib/env";

/**
 * Secrets typed into the admin pages (SMTP password, SSO client secrets) are
 * stored encrypted with SESSION_SECRET, so a database backup on its own does
 * not give them away. Rotating SESSION_SECRET means re-entering them.
 */
export function encryptSecret(plain: string): Promise<string> {
  return symmetricEncrypt({ key: env().SESSION_SECRET, data: plain });
}

/** Null when the secret was encrypted under a different SESSION_SECRET. */
export async function decryptSecret(stored: string): Promise<string | null> {
  try {
    return await symmetricDecrypt({ key: env().SESSION_SECRET, data: stored });
  } catch {
    return null;
  }
}
