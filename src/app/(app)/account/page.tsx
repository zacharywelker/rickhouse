import type { Metadata } from "next";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { requireSession } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

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
          <SectionDescription>An admin can change these from Configuration → Users.</SectionDescription>
        </SectionHeader>
        <SectionContent>
          <dl className="grid max-w-md grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{user.name}</dd>
            <dt className="text-muted-foreground">Username</dt>
            <dd>{user.username}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{user.email}</dd>
            <dt className="text-muted-foreground">Role</dt>
            <dd className="capitalize">{user.role}</dd>
          </dl>
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
