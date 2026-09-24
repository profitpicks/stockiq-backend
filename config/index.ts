import dotenv from "dotenv";
import { z } from "zod";

// Load .env file if available
dotenv.config();

const ConfigSchema = z.object({
  // App
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  appName: z.string().default("stockiq"),
  port: z.coerce.number().default(3000),
  host: z.string().default("0.0.0.0"),
  appUrl: z.string().default("http://localhost:3000"),

  // Security
  jwtSecret: z.string().min(16).default("development-only-jwt-secret-min-32-chars-long"),
  jwtExpirySeconds: z.coerce.number().default(900), // 15 minutes
  sessionSecret: z.string().min(16).default("development-only-session-secret-min-32-chars"),
  cookieSecure: z.preprocess((val) => val === "true" || val === true, z.boolean()).default(false),
  rateLimitWindowMs: z.coerce.number().default(60000),
  rateLimitMaxRequests: z.coerce.number().default(100),

  // Database
  database: z.object({
    host: z.string().default("localhost"),
    port: z.coerce.number().default(5432),
    database: z.string().default("stockiq_dev"),
    user: z.string().default("stockiq_user"),
    password: z.string().default("development_only_password"),
    poolMin: z.coerce.number().default(2),
    poolMax: z.coerce.number().default(10),
    ssl: z.preprocess((val) => val === "true" || val === true, z.boolean()).default(false),
  }),

  // Adapters
  adapters: z.object({
    otpMode: z.enum(["mock", "live"]).default("mock"),
    paymentMode: z.enum(["mock", "live"]).default("mock"),
    marketDataMode: z.enum(["mock", "live"]).default("mock"),
    esignMode: z.enum(["mock", "live"]).default("mock"),
    parrvaMode: z.enum(["mock", "live"]).default("mock"),
  }),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(overrides?: Record<string, unknown>): AppConfig {
  const rawConfig = {
    nodeEnv: overrides?.NODE_ENV ?? process.env.NODE_ENV,
    appName: overrides?.APP_NAME ?? process.env.APP_NAME,
    port: overrides?.APP_PORT ?? process.env.APP_PORT,
    host: overrides?.APP_HOST ?? process.env.APP_HOST,
    appUrl: overrides?.APP_URL ?? process.env.APP_URL,
    jwtSecret: overrides?.JWT_SECRET ?? process.env.JWT_SECRET,
    jwtExpirySeconds: overrides?.JWT_EXPIRY_SECONDS ?? process.env.JWT_EXPIRY_SECONDS,
    sessionSecret: overrides?.SESSION_SECRET ?? process.env.SESSION_SECRET,
    cookieSecure: overrides?.COOKIE_SECURE ?? process.env.COOKIE_SECURE,
    rateLimitWindowMs: overrides?.RATE_LIMIT_WINDOW_MS ?? process.env.RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests: overrides?.RATE_LIMIT_MAX_REQUESTS ?? process.env.RATE_LIMIT_MAX_REQUESTS,
    database: {
      host: overrides?.DB_HOST ?? process.env.DB_HOST,
      port: overrides?.DB_PORT ?? process.env.DB_PORT,
      database: overrides?.DB_NAME ?? process.env.DB_NAME,
      user: overrides?.DB_USER ?? process.env.DB_USER,
      password: overrides?.DB_PASSWORD ?? process.env.DB_PASSWORD,
      poolMin: overrides?.DB_POOL_MIN ?? process.env.DB_POOL_MIN,
      poolMax: overrides?.DB_POOL_MAX ?? process.env.DB_POOL_MAX,
      ssl: overrides?.DB_SSL ?? process.env.DB_SSL,
    },
    adapters: {
      otpMode: overrides?.OTP_ADAPTER_MODE ?? process.env.OTP_ADAPTER_MODE,
      paymentMode: overrides?.PAYMENT_ADAPTER_MODE ?? process.env.PAYMENT_ADAPTER_MODE,
      marketDataMode: overrides?.MARKET_DATA_ADAPTER_MODE ?? process.env.MARKET_DATA_ADAPTER_MODE,
      esignMode: overrides?.ESIGN_ADAPTER_MODE ?? process.env.ESIGN_ADAPTER_MODE,
      parrvaMode: overrides?.PARRVA_ADAPTER_MODE ?? process.env.PARRVA_ADAPTER_MODE,
    },
  };

  const parseResult = ConfigSchema.safeParse(rawConfig);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid application configuration: ${errorDetails}`);
  }

  return parseResult.data;
}

export const config = loadConfig();
