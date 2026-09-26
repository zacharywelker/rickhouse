import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { emailEnabled } from "@/lib/email/settings";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  if (!(await emailEnabled())) {
    return (
      <AuthCard title="Forgot password" description="Email isn't set up on this Rickhouse.">
        <p className="text-sm">Ask an admin to reset your password for you.</p>
        <Link href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Forgot password" description="We'll email you a link to choose a new one.">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
