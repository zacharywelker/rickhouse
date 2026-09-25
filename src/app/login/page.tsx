import type { Metadata } from "next";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Section className="w-full max-w-sm">
        <SectionHeader>
          <SectionTitle className="text-2xl text-accent">Rickhouse</SectionTitle>
          <SectionDescription>The bottles are behind the door. Password, please.</SectionDescription>
        </SectionHeader>
        <SectionContent>
          <LoginForm next={safeNext} />
        </SectionContent>
      </Section>
    </main>
  );
}
