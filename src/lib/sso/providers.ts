import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ssoProviders, type SsoKind } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

export const GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration";

/** The public face of a provider: safe for the login page and account settings. */
export type SsoButton = { providerId: string; name: string };

export type SsoProviderRow = {
  id: number;
  providerId: string;
  name: string;
  kind: SsoKind;
  discoveryUrl: string;
  clientId: string;
  enabled: boolean;
};

/** For the admin page: everything but the secret. */
export async function listSsoProviders(): Promise<SsoProviderRow[]> {
  return db
    .select({
      id: ssoProviders.id,
      providerId: ssoProviders.providerId,
      name: ssoProviders.name,
      kind: ssoProviders.kind,
      discoveryUrl: ssoProviders.discoveryUrl,
      clientId: ssoProviders.clientId,
      enabled: ssoProviders.enabled,
    })
    .from(ssoProviders)
    .orderBy(asc(ssoProviders.name));
}

export async function enabledSsoButtons(): Promise<SsoButton[]> {
  return db
    .select({ providerId: ssoProviders.providerId, name: ssoProviders.name })
    .from(ssoProviders)
    .where(eq(ssoProviders.enabled, true))
    .orderBy(asc(ssoProviders.name));
}

/** Enabled providers with decrypted secrets, for building the auth instance. */
export async function enabledSsoConfigs() {
  const rows = await db.select().from(ssoProviders).where(eq(ssoProviders.enabled, true));
  const configs = [];
  for (const row of rows) {
    const clientSecret = await decryptSecret(row.clientSecretEncrypted);
    if (clientSecret === null) {
      console.warn(`[rickhouse] SSO provider ${row.providerId} was saved under another SESSION_SECRET; re-enter its secret`);
      continue;
    }
    configs.push({ providerId: row.providerId, discoveryUrl: row.discoveryUrl, clientId: row.clientId, clientSecret });
  }
  return configs;
}

export type SsoInput = {
  providerId: string;
  name: string;
  kind: SsoKind;
  discoveryUrl: string;
  clientId: string;
  /** Blank on edit keeps the stored secret. */
  clientSecret: string | null;
  enabled: boolean;
};

export async function createSsoProvider(input: SsoInput & { clientSecret: string }): Promise<void> {
  const { clientSecret, ...rest } = input;
  await db.insert(ssoProviders).values({ ...rest, clientSecretEncrypted: await encryptSecret(clientSecret) });
}

/** The provider id is fixed after creation: it is part of the callback URL. */
export async function updateSsoProvider(id: number, input: Omit<SsoInput, "providerId">): Promise<void> {
  const { clientSecret, ...rest } = input;
  await db
    .update(ssoProviders)
    .set({ ...rest, ...(clientSecret ? { clientSecretEncrypted: await encryptSecret(clientSecret) } : {}) })
    .where(eq(ssoProviders.id, id));
}

export async function deleteSsoProvider(id: number): Promise<void> {
  await db.delete(ssoProviders).where(eq(ssoProviders.id, id));
}
