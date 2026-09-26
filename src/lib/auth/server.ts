import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, genericOAuth, twoFactor, username } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendMail, sendMailQuietly } from "@/lib/email/send";
import { emailEnabled } from "@/lib/email/settings";
import { inviteMail, otpMail, resetMail, securityNoticeMail } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { enabledSsoConfigs } from "@/lib/sso/providers";
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "./accounts";
import { CLIENT_IP_HEADER } from "./client-ip";
import { sameHostOrigins } from "./origins";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./passwords";

/**
 * Admins manage accounts, not collections: the admin role gets everything
 * Better Auth's default admin role has except signing in as someone else.
 */
const ac = createAccessControl(defaultStatements);
const roles = {
  admin: ac.newRole({
    user: ["create", "list", "set-role", "ban", "delete", "set-password", "set-email", "get", "update"],
    session: ["list", "revoke", "delete"],
  }),
  member: ac.newRole({ user: [], session: [] }),
};

const ATTEMPT_WINDOW_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const strict = { window: ATTEMPT_WINDOW_SECONDS, max: MAX_ATTEMPTS };

/** Password-reset and invitation links, and emailed sign-in codes, stay valid this long. */
export const RESET_LINK_HOURS = 24;

/** Marks a reset link as an invitation, so the email says so. */
export const INVITE_MARKER = "invite=1";

type RuntimeSettings = {
  email: boolean;
  sso: Awaited<ReturnType<typeof enabledSsoConfigs>>;
};

/**
 * Better Auth takes its providers and mail hooks when it is built, but SMTP
 * and SSO are edited from the admin pages at run time — so the instance is
 * built from the current settings and rebuilt when they change.
 */
function buildAuth(settings: RuntimeSettings) {
  const config = env();
  const appUrl = config.APP_URL;

  return betterAuth({
    appName: "Rickhouse",
    secret: config.SESSION_SECRET,
    // Unset: derived per request. SSO, passkeys and emailed links need it.
    baseURL: appUrl,
    trustedOrigins: async (request) => (request ? sameHostOrigins(request.headers) : []),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        twoFactor: schema.twoFactors,
        passkey: schema.passkeys,
      },
    }),
    emailAndPassword: {
      enabled: true,
      // Admins create accounts; nobody signs themselves up.
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: RESET_LINK_HOURS * 60 * 60,
      // Only while email works; without it, "forgot password" is hidden and
      // Better Auth answers the endpoint with "not enabled".
      ...(settings.email
        ? {
            sendResetPassword: async ({ user, url }) => {
              const invite = decodeURIComponent(url).includes(INVITE_MARKER);
              await sendMail(invite ? inviteMail(user, url) : resetMail(user, url));
            },
            onPasswordReset: async ({ user }) => {
              await sendMailQuietly(securityNoticeMail(user, "Your Rickhouse password was reset."));
            },
          }
        : {}),
    },
    account: {
      accountLinking: {
        enabled: true,
        // SSO identities are linked only from a signed-in session, never by
        // matching emails — the SSO account's email need not match ours.
        disableImplicitLinking: true,
        allowDifferentEmails: true,
      },
    },
    user: {
      additionalFields: {
        mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    session: {
      expiresIn: config.SESSION_TTL_DAYS * 24 * 60 * 60,
      // Slide the expiry forward at most once a day.
      updateAge: 24 * 60 * 60,
    },
    databaseHooks: settings.email
      ? {
          account: {
            create: {
              after: async (account) => {
                if (account.providerId === "credential") return;
                const user = await userById(account.userId);
                if (user) {
                  await sendMailQuietly(
                    securityNoticeMail(user, `A sign-in with ${account.providerId} was linked to your account.`),
                  );
                }
              },
            },
          },
        }
      : undefined,
    hooks: settings.email
      ? {
          after: createAuthMiddleware(async (ctx) => {
            // Admin resets and the CLI write the password directly and say
            // so themselves; this covers someone changing their own.
            if (ctx.path !== "/change-password") return;
            const user = ctx.context.session?.user;
            if (user && !(ctx.context.returned instanceof Error)) {
              await sendMailQuietly(securityNoticeMail(user, "Your Rickhouse password was changed."));
            }
          }),
        }
      : undefined,
    rateLimit: {
      // Better Auth only enables this in production by default.
      enabled: true,
      storage: "memory",
      customRules: {
        "/sign-in/*": strict,
        "/change-password": strict,
        // Another way to test a password, given a session.
        "/verify-password": strict,
        "/two-factor/*": strict,
        "/request-password-reset": { window: 15 * 60, max: 3 },
        "/reset-password": strict,
      },
    },
    advanced: {
      cookiePrefix: "rickhouse",
      useSecureCookies: config.COOKIE_SECURE,
      database: { generateId: "serial" },
      ipAddress: {
        // Set by the /api/auth route from X-Forwarded-For (see client-ip.ts).
        // Without an IP every request shares one rate-limit bucket, and one
        // typo-prone guest locks everybody out.
        ipAddressHeaders: [CLIENT_IP_HEADER],
      },
    },
    telemetry: { enabled: false },
    plugins: [
      username({ minUsernameLength: USERNAME_MIN_LENGTH, maxUsernameLength: USERNAME_MAX_LENGTH }),
      admin({
        ac,
        roles,
        defaultRole: "member",
        adminRoles: ["admin"],
        bannedUserMessage: "This account has been deactivated.",
      }),
      twoFactor({
        issuer: "Rickhouse",
        // Emailed codes only while email works; the authenticator app and
        // backup codes always do.
        ...(settings.email
          ? { otpOptions: { sendOTP: async ({ user, otp }) => sendMail(otpMail(user, otp)) } }
          : {}),
      }),
      // A passkey is bound to one domain, so it needs APP_URL.
      ...(appUrl ? [passkey({ rpID: new URL(appUrl).hostname, rpName: "Rickhouse", origin: appUrl })] : []),
      // Sign-in only for identities someone already linked while signed in.
      ...(appUrl && settings.sso.length > 0
        ? [
            genericOAuth({
              config: settings.sso.map((provider) => ({
                ...provider,
                scopes: ["openid", "email", "profile"],
                pkce: true,
                disableSignUp: true,
                disableImplicitSignUp: true,
              })),
            }),
          ]
        : []),
      // Lets server actions that call auth.api set and clear the cookie.
      nextCookies(),
    ],
  });
}

async function userById(id: string | number) {
  const [row] = await db
    .select({ name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(sql`${schema.users.id} = ${Number(id)}`)
    .limit(1);
  return row ?? null;
}

type Auth = ReturnType<typeof buildAuth>;

/** How often settings are re-checked; admin changes land within this. */
const RECHECK_MS = 10_000;

const cache = globalThis as unknown as {
  __rickhouseAuth?: { auth: Auth; stamp: string; checkedAt: number };
};

/** Changes whenever SMTP or an SSO provider is added, edited or removed. */
async function settingsStamp(): Promise<string> {
  const [row] = await db.execute<{ stamp: string }>(sql`
    SELECT concat_ws('|',
      (SELECT updated_at::text FROM smtp_settings WHERE id = 1),
      (SELECT count(*)::text || ':' || coalesce(max(updated_at)::text, '') FROM sso_providers)
    ) AS stamp
  `);
  return row?.stamp ?? "";
}

export async function getAuth(): Promise<Auth> {
  const now = Date.now();
  const current = cache.__rickhouseAuth;
  if (current && now - current.checkedAt < RECHECK_MS) return current.auth;

  const stamp = await settingsStamp();
  if (current && current.stamp === stamp) {
    current.checkedAt = now;
    return current.auth;
  }
  const [email, sso] = await Promise.all([emailEnabled(), enabledSsoConfigs()]);
  const auth = buildAuth({ email, sso });
  cache.__rickhouseAuth = { auth, stamp, checkedAt: now };
  return auth;
}

/** After an admin saves SMTP or SSO settings, so this process picks them up at once. */
export function forgetAuth(): void {
  delete cache.__rickhouseAuth;
}

export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
