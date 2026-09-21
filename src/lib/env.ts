import { z } from "zod";

/**
 * Parsed once, on the server only. Import this rather than reading
 * `process.env` directly so a missing variable fails loudly at boot.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  /** The single shared password for the whole app. No user table by design. */
  APP_PASSWORD: z.string().min(8, "APP_PASSWORD must be at least 8 characters"),
  /** HMAC key for the session cookie. Rotating it logs everyone out. */
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** Set true only when the app is reached over HTTPS; most Unraid LAN setups are not. */
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** Absolute path to the uploads volume inside the container. */
  UPLOAD_DIR: z.string().min(1).default("/data/uploads"),
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
