import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, username } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";
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

const SIGN_IN_WINDOW_SECONDS = 60;
const SIGN_IN_MAX_ATTEMPTS = 5;

const config = env();

export const auth = betterAuth({
  appName: "Rickhouse",
  secret: config.SESSION_SECRET,
  // Unset: derived per request. SSO and emailed links will require it.
  baseURL: config.APP_URL,
  trustedOrigins: async (request) => (request ? sameHostOrigins(request.headers) : []),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Admins create accounts; nobody signs themselves up.
    disableSignUp: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    revokeSessionsOnPasswordReset: true,
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
  rateLimit: {
    // Better Auth only enables this in production by default.
    enabled: true,
    storage: "memory",
    customRules: {
      "/sign-in/*": { window: SIGN_IN_WINDOW_SECONDS, max: SIGN_IN_MAX_ATTEMPTS },
      "/change-password": { window: SIGN_IN_WINDOW_SECONDS, max: SIGN_IN_MAX_ATTEMPTS },
      // Another way to test a password, given a session.
      "/verify-password": { window: SIGN_IN_WINDOW_SECONDS, max: SIGN_IN_MAX_ATTEMPTS },
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
    // Lets server actions that call auth.api set and clear the cookie.
    nextCookies(),
  ],
});

export type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
