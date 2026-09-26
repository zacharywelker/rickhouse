import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a password" };
export const dynamic = "force-dynamic";

/**
 * Where emailed reset and invitation links land: Better Auth checks the token
 * at /api/auth/reset-password/<token>, then sends the browser here with it.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string; invite?: string }>;
}) {
  const { token, error, invite } = await searchParams;
  const welcome = invite === "1";

  if (!token || error) {
    return (
      <AuthCard title="Link expired" description="This link has already been used, or it's more than a day old.">
        <Link href="/forgot-password" className="text-sm text-primary underline-offset-4 hover:underline">
          Send a new one
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title={welcome ? "Welcome to Rickhouse" : "Choose a new password"}
      description={welcome ? "Pick a password to finish setting up your account." : "Pick something you haven't used here before."}
    >
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
