import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { db, schema } from "@/db";
import { emailEnabled } from "@/lib/email/settings";
import { env } from "@/lib/env";
import { enabledSsoButtons } from "@/lib/sso/providers";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

/**
 * True until some admin has chosen their own password — i.e. on a fresh
 * install, or right after upgrading from the shared APP_PASSWORD, when the
 * only way in is the generated password in the container log.
 */
async function awaitingFirstAdmin(): Promise<boolean> {
  const [settled] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.role, "admin"), eq(schema.users.mustChangePassword, false)))
    .limit(1);
  return !settled;
}

/**
 * Only same-origin paths, so a crafted link cannot bounce you off-site after
 * signing in. Resolved rather than pattern-matched: browsers read "/\x" as
 * "//x", another site.
 */
function safeNextPath(next: string | undefined): string {
  if (!next) return "/";
  const base = "http://rickhouse.invalid";
  try {
    const url = new URL(next, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}

/** Better Auth sends SSO failures back here as ?error=<code>. */
function ssoErrorMessage(code: string): string {
  if (/sign.?up|not.?found|unable_to_link|account_not_linked/i.test(code)) {
    return "That sign-in isn't linked to an account here. Sign in with your password, then link it from Account settings.";
  }
  return "Single sign-on didn't work. Try again, or sign in with your password.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const safeNext = safeNextPath(next);
  // SSO and passkeys both need the public address (APP_URL) to work.
  const appUrl = env().APP_URL;
  const [firstRun, canReset, sso] = await Promise.all([
    awaitingFirstAdmin(),
    emailEnabled(),
    appUrl ? enabledSsoButtons() : Promise.resolve([]),
  ]);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Section className="w-full max-w-sm">
        <SectionHeader>
          <SectionTitle className="text-2xl text-accent">Rickhouse</SectionTitle>
          <SectionDescription>The bottles are behind the door. Name and password, please.</SectionDescription>
        </SectionHeader>
        <SectionContent className="flex flex-col gap-4">
          {firstRun ? (
            <p className="border-l-2 border-accent pl-3 text-sm text-muted-foreground">
              First time in? Rickhouse created an <strong className="text-foreground">admin</strong> account and printed
              its password to the container log when it started.
            </p>
          ) : null}
          <LoginForm
            next={safeNext}
            sso={sso}
            passkeys={Boolean(appUrl)}
            canReset={canReset}
            ssoError={error ? ssoErrorMessage(error) : null}
          />
        </SectionContent>
      </Section>
    </main>
  );
}
