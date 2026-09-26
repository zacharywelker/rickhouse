import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { smtpSettings } from "@/db/schema";
import { env } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  fromAddress: string;
};

/** What the admin page shows: never the password itself. */
export type SmtpSummary = Omit<SmtpConfig, "password"> & { hasPassword: boolean };

export async function getSmtpSummary(): Promise<SmtpSummary | null> {
  const [row] = await db.select().from(smtpSettings).where(eq(smtpSettings.id, 1)).limit(1);
  if (!row) return null;
  return {
    host: row.host,
    port: row.port,
    secure: row.secure,
    username: row.username,
    fromAddress: row.fromAddress,
    hasPassword: row.passwordEncrypted !== null,
  };
}

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const [row] = await db.select().from(smtpSettings).where(eq(smtpSettings.id, 1)).limit(1);
  if (!row) return null;
  return {
    host: row.host,
    port: row.port,
    secure: row.secure,
    username: row.username,
    password: row.passwordEncrypted ? await decryptSecret(row.passwordEncrypted) : null,
    fromAddress: row.fromAddress,
  };
}

/**
 * Email only goes out once SMTP is saved *and* APP_URL is set: every mail
 * carries a link, and a link built from a request's Host header could be
 * pointed at someone else's site.
 */
export async function emailEnabled(): Promise<boolean> {
  if (!env().APP_URL) return false;
  return (await db.$count(smtpSettings)) > 0;
}

/** `password: undefined` keeps the stored one; `null` clears it. */
export async function saveSmtpSettings(
  input: Omit<SmtpConfig, "password"> & { password: string | null | undefined },
): Promise<void> {
  const { password, ...rest } = input;
  const passwordEncrypted =
    password === undefined ? undefined : password === null ? null : await encryptSecret(password);
  const values = { ...rest, ...(passwordEncrypted !== undefined ? { passwordEncrypted } : {}) };
  await db
    .insert(smtpSettings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: smtpSettings.id, set: { ...values, updatedAt: new Date() } });
}

export async function deleteSmtpSettings(): Promise<void> {
  await db.delete(smtpSettings).where(eq(smtpSettings.id, 1));
}
