import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  DATABASE_URL: z.string().url(),

  // Integration OAuth credentials (optional — only needed for enabled providers)
  INTERCOM_CLIENT_ID: z.string().default(""),
  INTERCOM_CLIENT_SECRET: z.string().default(""),
  ZENDESK_CLIENT_ID: z.string().default(""),
  ZENDESK_CLIENT_SECRET: z.string().default(""),
  SALESFORCE_CLIENT_ID: z.string().default(""),
  SALESFORCE_CLIENT_SECRET: z.string().default(""),
  HUBSPOT_CLIENT_ID: z.string().default(""),
  HUBSPOT_CLIENT_SECRET: z.string().default(""),

  // AI / Extraction
  OPENAI_API_KEY: z.string().default(""),

  // Alerts
  SLACK_WEBHOOK_URL: z.string().default(""),
});

export const env = envSchema.parse(process.env);
