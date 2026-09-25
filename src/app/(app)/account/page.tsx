import type { Metadata } from "next";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { requireSession } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireSession();

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
            Signed in as {user.email} ({user.role}). Email changes arrive with email support.
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
    </div>
  );
}
