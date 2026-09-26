import type { Metadata } from "next";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { and, asc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { CREDENTIAL_PROVIDER } from "@/lib/auth/accounts";
import { env } from "@/lib/env";
import { enabledSsoButtons } from "@/lib/sso/providers";
import { ChangePasswordForm } from "./change-password-form";
import { LinkedSignIns } from "./linked-sign-ins";
import { PasskeysSection } from "./passkeys-section";
import { ProfileForm } from "./profile-form";
import { TwoFactorSection } from "./two-factor-section";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ linkError?: string }> }) {
  const [user, { linkError }] = await Promise.all([requireSession(), searchParams]);
  const appUrl = env().APP_URL;
  const [passkeys, linked, providers] = await Promise.all([
    db
      .select({ id: schema.passkeys.id, name: schema.passkeys.name, createdAt: schema.passkeys.createdAt })
      .from(schema.passkeys)
      .where(eq(schema.passkeys.userId, user.id))
      .orderBy(asc(schema.passkeys.id)),
    db
      .select({ providerId: schema.accounts.providerId, accountId: schema.accounts.accountId })
      .from(schema.accounts)
      .where(and(eq(schema.accounts.userId, user.id), ne(schema.accounts.providerId, CREDENTIAL_PROVIDER))),
    appUrl ? enabledSsoButtons() : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Who you are here, and how you sign in.</p>
      </div>

      <Section>
        <SectionHeader>
          <SectionTitle>Profile</SectionTitle>
          <SectionDescription>
            Signed in as {user.email} ({user.role}).
          </SectionDescription>
        </SectionHeader>
        <SectionContent>
          <ProfileForm name={user.name} username={user.username} />
        </SectionContent>
      </Section>

      <Section>
        <SectionHeader>
          <SectionTitle>Password</SectionTitle>
          <SectionDescription>Changing it signs you out everywhere else.</SectionDescription>
        </SectionHeader>
        <SectionContent>
          <ChangePasswordForm />
        </SectionContent>
      </Section>

      <Section>
        <SectionHeader>
          <SectionTitle>Two-step sign-in</SectionTitle>
          <SectionDescription>A code from your phone as well as your password.</SectionDescription>
        </SectionHeader>
        <SectionContent>
          <TwoFactorSection enabled={user.twoFactorEnabled} />
        </SectionContent>
      </Section>

      <Section>
        <SectionHeader>
          <SectionTitle>Passkeys</SectionTitle>
          <SectionDescription>Sign in without typing a password.</SectionDescription>
        </SectionHeader>
        <SectionContent>
          <PasskeysSection
            available={Boolean(appUrl)}
            passkeys={passkeys.map((key) => ({ ...key, createdAt: key.createdAt?.toISOString() ?? null }))}
          />
        </SectionContent>
      </Section>

      <Section>
        <SectionHeader>
          <SectionTitle>Linked sign-ins</SectionTitle>
          <SectionDescription>
            Link a single sign-on account here, and you can use it on the sign-in page. Linking never creates a
            new account, and your password keeps working.
          </SectionDescription>
        </SectionHeader>
        <SectionContent className="flex flex-col gap-3">
          {linkError ? (
            <p role="alert" className="text-sm text-destructive">
              That sign-in couldn&rsquo;t be linked. It may already be linked to someone else here.
            </p>
          ) : null}
          <LinkedSignIns providers={providers} linked={linked} />
        </SectionContent>
      </Section>
    </div>
  );
}
