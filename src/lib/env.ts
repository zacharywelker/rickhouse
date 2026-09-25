import { z } from "zod";
import { buildBlockList } from "@/lib/auth/client-ip";

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
  /** Set true only when the app is reached over HTTPS; most Unraid LAN setups are not. */
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
  TRUSTED_PROXIES: z
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
    }),
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
