import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";

/** The bare centred card the sign-in pages share. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Section className="w-full max-w-sm">
        <SectionHeader>
          <SectionTitle className="text-2xl text-accent">{title}</SectionTitle>
          <SectionDescription>{description}</SectionDescription>
        </SectionHeader>
        <SectionContent className="flex flex-col gap-4">{children}</SectionContent>
      </Section>
    </main>
  );
}
