import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(1),
  API_BASE_URL: z.string().default("http://localhost:4000"),

  // Integration OAuth credentials
  INTERCOM_CLIENT_ID: z.string().default(""),
  INTERCOM_CLIENT_SECRET: z.string().default(""),
  INTERCOM_WEBHOOK_SECRET: z.string().default(""),
  ZENDESK_CLIENT_ID: z.string().default(""),
  ZENDESK_CLIENT_SECRET: z.string().default(""),
  ZENDESK_WEBHOOK_SECRET: z.string().default(""),
  SALESFORCE_CLIENT_ID: z.string().default(""),
  SALESFORCE_CLIENT_SECRET: z.string().default(""),
  HUBSPOT_CLIENT_ID: z.string().default(""),
  HUBSPOT_CLIENT_SECRET: z.string().default(""),

  // AI / LLM
  OPENAI_API_KEY: z.string().default(""),
});

export const env = envSchema.parse(process.env);
