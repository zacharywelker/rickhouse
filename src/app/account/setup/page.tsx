import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { requireSession } from "@/lib/auth";
import { isPlaceholderEmail } from "@/lib/auth/passwords";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Choose a password" };
export const dynamic = "force-dynamic";

/**
 * Outside the (app) group on purpose: that layout sends anyone still on a
 * generated password here, so it cannot also wrap this page.
 */
export default async function AccountSetupPage() {
  const user = await requireSession({ allowPendingSetup: true });
  if (!user.mustChangePassword) redirect("/");
  const needsEmail = isPlaceholderEmail(user.email);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Section className="w-full max-w-sm">
        <SectionHeader>
          <SectionTitle className="text-2xl text-accent">Welcome, {user.username}</SectionTitle>
          <SectionDescription>
            You signed in with a temporary password. Choose your own
            {needsEmail ? " and add your email address" : ""} to continue.
          </SectionDescription>
        </SectionHeader>
        <SectionContent className="flex flex-col gap-4">
          <SetupForm needsEmail={needsEmail} />
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm" className="w-full">
              Sign out
            </Button>
          </form>
        </SectionContent>
      </Section>
    </main>
  );
}
