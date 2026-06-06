import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: "../../.env" });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16).default("development-secret-change-me"),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  APP_PUBLIC_URL: z.string().optional().default("http://localhost:5173"),
  AI_PROVIDER: z.enum(["mock", "openai"]).default("mock"),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(700)
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === "production" && (value.JWT_SECRET === "development-secret-change-me" || value.JWT_SECRET.length < 32)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["JWT_SECRET"],
      message: "JWT_SECRET must be at least 32 characters and non-default in production"
    });
  }
});

export const env = envSchema.parse(process.env);
