import { z } from "zod";
import { buildBlockList } from "@/lib/auth/client-ip";

/** Comma-separated IPs and CIDR ranges; a bad entry fails at boot. */
function ipList() {
  return z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .superRefine((entries, ctx) => {
      try {
        buildBlockList(entries);
      } catch (error) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: (error as Error).message });
      }
    });
}

/**
 * Parsed once, on the server only. Import this rather than reading
 * `process.env` directly so a missing variable fails loudly at boot.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  /**
   * Better Auth's secret: signs session cookies and encrypts stored tokens.
   * Rotating it signs everyone out.
   */
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /**
   * Set true when the app is reached over HTTPS, e.g. through a reverse proxy
   * or tunnel. Session cookies are then marked Secure for HTTPS requests;
   * plain-HTTP requests straight to the LAN address keep ordinary cookies,
   * since browsers drop Secure ones there (see secureCookiesFor).
   */
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /**
   * The public address, e.g. https://rickhouse.example.com. Optional while
   * sign-in is password-only; SSO callbacks and emailed links will need it,
   * because building those from a request's Host header lets a crafted
   * request point them somewhere else.
   */
  APP_URL: z.preprocess(
    // Compose passes unset variables through as "".
    (v) => (v === "" ? undefined : v),
    z
      .string()
      .url()
      .optional()
      .transform((v) => (v ? v.replace(/\/+$/, "") : undefined)),
  ),
  /**
   * Proxies in front of your reverse proxy — typically Cloudflare's ranges
   * (https://www.cloudflare.com/ips/) — as comma-separated IPs or CIDR
   * ranges. Rate limiting counts sign-in attempts per client IP: the address
   * your reverse proxy appends to X-Forwarded-For is taken as the client
   * unless it is listed here, in which case the one before it is. Leave empty
   * when Caddy, Nginx Proxy Manager or Traefik talk to visitors directly.
   */
  TRUSTED_PROXIES: ipList(),
  /**
   * Refuse new passwords found in Have I Been Pwned's breach corpus. Only a
   * 5-character hash prefix is sent. Turn off for a server with no internet.
   */
  PASSWORD_BREACH_CHECK: z
    .enum(["true", "false", ""])
    .default("true")
    .transform((v) => v !== "false"),
  /**
   * Look up TTB label approvals (COLAs) in TTB's public registry by TTB ID:
   * the record and its label images. Off keeps TTB IDs and links to the
   * registry, but nothing is fetched. Turn off for a server with no internet.
   */
  COLA_LOOKUP: z
    .enum(["true", "false", ""])
    .default("true")
    .transform((v) => v !== "false"),
  /**
   * Cloudflare Turnstile keys. With both set, sign-in and "forgot password"
   * ask for a Turnstile check first. Kept here rather than in the admin
   * pages so a bad key can be undone without signing in.
   */
  TURNSTILE_SITE_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  TURNSTILE_SECRET_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  /**
   * Visitors from these IPs or CIDR ranges — typically your LAN, e.g.
   * 192.168.1.0/24 — sign in without the Turnstile check when they open
   * Rickhouse at an address other than APP_URL. The visitor is the same
   * address rate limiting uses (see TRUSTED_PROXIES).
   */
  TURNSTILE_SKIP_NETWORKS: ipList(),
  /** Absolute path to the uploads volume inside the container. */
  UPLOAD_DIR: z.string().min(1).default("/data/uploads"),
  /** Absolute path to the backups volume inside the container. */
  BACKUP_DIR: z.string().min(1).default("/data/backups"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${detail}\n\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
