import dotenv from "dotenv";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRootEnvPath = resolve(__dirname, "../../../../.env");
dotenv.config({ path: repoRootEnvPath });

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const sameSiteFromEnv = z.preprocess((value) => {
  if (typeof value === "string") return value.toLowerCase();
  return value;
}, z.enum(["strict", "lax", "none"]));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WS_PORT: z.coerce.number().int().positive().default(4001),
  APP_NAME: z.string().min(1).default("dsr-api"),
  APP_PUBLIC_URL: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z
    .enum([
      "fatal",
      "error",
      "warn",
      "info",
      "http",
      "verbose",
      "debug",
      "trace",
      "silly",
      "silent"
    ])
    .default("info"),
  CORS_ORIGIN: z.string().min(1).default("*"),
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(5),
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_EXPIRY: z.string().min(1).default("15m"),
  JWT_REFRESH_EXPIRY: z.string().min(1).default("7d"),
  JWT_REFRESH_COOKIE_NAME: z.string().min(1).default("refreshToken"),
  JWT_REFRESH_COOKIE_HTTP_ONLY: booleanFromEnv.default(true),
  JWT_REFRESH_COOKIE_SECURE: booleanFromEnv.default(false),
  JWT_REFRESH_COOKIE_SAME_SITE: sameSiteFromEnv.default("strict"),
  JWT_REFRESH_COOKIE_MAX_AGE: z.coerce.number().int().positive().default(604800000),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanFromEnv.default(false),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM: z.string().min(1)
});

const rawEnv = {
  ...process.env,
  MONGODB_URI: process.env.MONGODB_URI ?? process.env.mongodb_uri,
  REDIS_URL: process.env.REDIS_URL ?? process.env.redis_url,
  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET ?? process.env.jwt_access_secret,
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET ?? process.env.jwt_refresh_secret,
  JWT_ACCESS_EXPIRY:
    process.env.JWT_ACCESS_EXPIRY ?? process.env.JWT_EXPIRES_IN ?? process.env.jwt_access_expiry,
  JWT_REFRESH_EXPIRY:
    process.env.JWT_REFRESH_EXPIRY ?? process.env.jwt_refresh_expiry ?? "7d",
  JWT_REFRESH_COOKIE_NAME:
    process.env.JWT_REFRESH_COOKIE_NAME ?? process.env.jwt_refresh_cookie_name,
  JWT_REFRESH_COOKIE_HTTP_ONLY:
    process.env.JWT_REFRESH_COOKIE_HTTP_ONLY ?? process.env.jwt_refresh_cookie_http_only,
  JWT_REFRESH_COOKIE_SECURE:
    process.env.JWT_REFRESH_COOKIE_SECURE ?? process.env.jwt_refresh_cookie_secure,
  JWT_REFRESH_COOKIE_SAME_SITE:
    process.env.JWT_REFRESH_COOKIE_SAME_SITE ?? process.env.jwt_refresh_cookie_same_site,
  JWT_REFRESH_COOKIE_MAX_AGE:
    process.env.JWT_REFRESH_COOKIE_MAX_AGE ?? process.env.jwt_refresh_cookie_max_age,
  SMTP_HOST: process.env.SMTP_HOST ?? process.env.smtp_host,
  SMTP_PORT: process.env.SMTP_PORT ?? process.env.smtp_port,
  SMTP_SECURE: process.env.SMTP_SECURE ?? process.env.smtp_secure,
  SMTP_USER: process.env.SMTP_USER ?? process.env.smtp_user,
  SMTP_PASS: process.env.SMTP_PASS ?? process.env.smtp_pass,
  SMTP_FROM: process.env.SMTP_FROM ?? process.env.smtp_from,
  QUEUE_CONCURRENCY: process.env.QUEUE_CONCURRENCY ?? process.env.queue_concurrency,
  APP_PUBLIC_URL: process.env.APP_PUBLIC_URL ?? process.env.app_public_url
};

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  const { fieldErrors } = parsed.error.flatten();
  throw new Error(`Invalid environment variables: ${JSON.stringify(fieldErrors)}`);
}

const env = parsed.data;

export const config = Object.freeze({
  app: {
    name: env.APP_NAME,
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === "production",
    port: env.PORT,
    wsPort: env.WS_PORT,
    logLevel: env.LOG_LEVEL,
    publicUrl: env.APP_PUBLIC_URL
  },
  cors: {
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN
  },
  mongo: {
    uri: env.MONGODB_URI
  },
  redis: {
    url: env.REDIS_URL
  },
  queue: {
    concurrency: env.QUEUE_CONCURRENCY
  },
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessExpiry: env.JWT_ACCESS_EXPIRY,
    refreshExpiry: env.JWT_REFRESH_EXPIRY,
    refreshCookie: {
      name: env.JWT_REFRESH_COOKIE_NAME,
      httpOnly: env.JWT_REFRESH_COOKIE_HTTP_ONLY,
      secure: env.JWT_REFRESH_COOKIE_SECURE,
      sameSite: env.JWT_REFRESH_COOKIE_SAME_SITE,
      maxAge: env.JWT_REFRESH_COOKIE_MAX_AGE
    },
    secret: env.JWT_ACCESS_SECRET,
    expiresIn: env.JWT_ACCESS_EXPIRY
  },
  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM
  }
});
