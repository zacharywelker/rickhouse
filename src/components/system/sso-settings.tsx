import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { ProviderForm } from "@/app/(app)/system/sso/provider-form";
import { env } from "@/lib/env";
import { listSsoProviders } from "@/lib/sso/providers";

export async function SsoSettingsSection() {
  const providers = await listSsoProviders();
  const appUrl = env().APP_URL;

  return (
    <>
      <div className="max-w-2xl">
        <h2 className="text-2xl text-accent">Single sign-on</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every provider enabled here appears on the sign-in page for everyone. It never creates accounts: people
          link it to the account they already have, from Account settings, and only then can sign in with it.
        </p>
      </div>
      {!appUrl ? (
        <p role="alert" className="max-w-2xl border-l-2 border-destructive pl-3 text-sm">
          Set <code>APP_URL</code> in your <code>.env</code> and restart. Providers send people back to a fixed
          callback URL, so single sign-on stays off until Rickhouse knows its own address.
        </p>
      ) : null}
      {providers.map((provider) => (
        <Section key={provider.id}>
          <SectionHeader>
            <SectionTitle>{provider.name}</SectionTitle>
            <SectionDescription>{provider.enabled ? "Enabled" : "Disabled"} · {provider.providerId}</SectionDescription>
          </SectionHeader>
          <SectionContent>
            <ProviderForm provider={provider} callbackBase={appUrl ?? "https://your-rickhouse"} />
          </SectionContent>
        </Section>
      ))}
      <Section>
        <SectionHeader>
          <SectionTitle>Add a provider</SectionTitle>
          <SectionDescription>
            Create an OIDC client at the provider first; the client secret is stored encrypted with SESSION_SECRET.
          </SectionDescription>
        </SectionHeader>
        <SectionContent>
          <ProviderForm provider={null} callbackBase={appUrl ?? "https://your-rickhouse"} />
        </SectionContent>
      </Section>
    </>
  );
}
