import type { Metadata } from "next";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { getSmtpSummary } from "@/lib/email/settings";
import { env } from "@/lib/env";
import { SmtpForm } from "./smtp-form";

export const metadata: Metadata = { title: "Email" };
export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  const current = await getSmtpSummary();
  const appUrl = env().APP_URL;

  return (
    <>
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">Email</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          With a mail server, Rickhouse can send password-reset links, invitations, emailed sign-in codes and
          security notices. Without one, those features stay hidden and the command-line reset is the way back in.
        </p>
      </div>
      {!appUrl ? (
        <p role="alert" className="max-w-2xl border-l-2 border-destructive pl-3 text-sm">
          Set <code>APP_URL</code> in your <code>.env</code> (the address people type, e.g.
          https://rickhouse.example.com) and restart. Every email carries a link, and Rickhouse won&rsquo;t build
          links from guesswork. You can save the settings now; nothing is sent until then.
        </p>
      ) : null}
      <Section>
        <SectionHeader>
          <SectionTitle>Mail server</SectionTitle>
          <SectionDescription>The password is stored encrypted with SESSION_SECRET.</SectionDescription>
        </SectionHeader>
        <SectionContent>
          <SmtpForm current={current} />
        </SectionContent>
      </Section>
    </>
  );
}
