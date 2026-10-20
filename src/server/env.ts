import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Postgres URL. When absent, an embedded PGlite database is used (local dev / demo). */
  DATABASE_URL: z.string().optional(),
  /** Directory for the embedded database. Unset means in-memory (data lost on restart). */
  PGLITE_DATA_DIR: z.string().optional(),
  /** 32-byte key (base64 or hex) encrypting Meta tokens at rest. */
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  /** Secret pepper for HMAC fingerprints of share-link and session tokens. */
  TOKEN_HASH_SECRET: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  META_GRAPH_API_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .default("v24.0"),
  /** Enables appsecret_proof on every Graph API call when set; with META_APP_ID, enables "Se connecter avec Facebook". */
  META_APP_SECRET: z.string().optional(),
  META_APP_ID: z
    .string()
    .regex(/^\d{5,25}$/)
    .optional(),
  /** Optional Facebook Login for Business configuration ID (system-user token, ads_read only). */
  META_LOGIN_CONFIG_ID: z
    .string()
    .regex(/^\d{5,25}$/)
    .optional(),
  /** Seeds synthetic demo clients, accounts and dashboards on an empty database. */
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
  APP_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

const DEV_FALLBACK_SECRET = "dev-only-insecure-secret-change-me-0123456789";

/** Secrets must be configured in production; development falls back to a fixed value. */
export function requireSecret(name: "TOKEN_ENCRYPTION_KEY" | "TOKEN_HASH_SECRET"): string {
  const value = env()[name];
  if (value) return value;
  if (env().NODE_ENV === "production") {
    throw new Error(`${name} must be set in production.`);
  }
  return DEV_FALLBACK_SECRET;
}

export function isProduction(): boolean {
  return env().NODE_ENV === "production";
}
