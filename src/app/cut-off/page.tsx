import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";

export const metadata: Metadata = { title: "Cut off" };

/**
 * Where a deactivated account lands after a correct password. Deactivation
 * revokes every session, so this is only reachable from the sign-in form —
 * a wrong password still just says "wrong password".
 */
export default function CutOffPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Section className="w-full max-w-sm">
        <SectionHeader>
          <SectionTitle className="text-2xl text-accent">Cut off.</SectionTitle>
          <SectionDescription>The bartender has closed your tab.</SectionDescription>
        </SectionHeader>
        <SectionContent className="flex flex-col gap-4 text-sm">
          <p>
            This account has been deactivated, so no more pours from this rickhouse. If you think that&rsquo;s a
            mistake, take it up with whoever runs the place.
          </p>
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </SectionContent>
      </Section>
    </main>
  );
}
