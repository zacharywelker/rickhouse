import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { emailEnabled } from "@/lib/email/settings";
import { TwoFactorForm } from "./two-factor-form";

export const metadata: Metadata = { title: "Two-step sign-in" };
export const dynamic = "force-dynamic";

/**
 * Reached right after a correct password on an account with two-factor on.
 * There is no session yet: Better Auth holds the half-finished sign-in in its
 * own short-lived cookie until a code is verified.
 */
export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
  return (
    <AuthCard title="One more step" description="Enter the code from your authenticator app.">
      <TwoFactorForm next={safeNext} canEmail={await emailEnabled()} />
    </AuthCard>
  );
}
