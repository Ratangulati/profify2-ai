import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PM_YC_API_KEY: z.string().optional(),
  LLM_PROVIDER: z.enum(["openai", "anthropic"]).default("openai"),
  OPENAI_API_KEY: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().default(""),
  PORT: z.coerce.number().default(3100),
  RATE_LIMIT_RPM: z.coerce.number().default(100),
  CACHE_TTL_SECONDS: z.coerce.number().default(300),
});

export const env = envSchema.parse(process.env);

export function getLLMApiKey(): string | undefined {
  if (env.LLM_PROVIDER === "anthropic") return env.ANTHROPIC_API_KEY || undefined;
  return env.OPENAI_API_KEY || undefined;
}
