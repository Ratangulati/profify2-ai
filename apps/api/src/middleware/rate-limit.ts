import rateLimit from "express-rate-limit";
import IORedis from "ioredis";
import RedisStore from "rate-limit-redis";

import { env } from "../env.js";

let redisClient: IORedis | null = null;

function getRedisClient(): IORedis {
  if (!redisClient) {
    redisClient = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    redisClient.on("error", (err) => {
      console.error("[RateLimit] Redis connection error:", err.message);
    });
  }
  return redisClient;
}

function createRedisStore(prefix: string) {
  return new RedisStore({
    sendCommand: async (...args: string[]) => {
      const client = getRedisClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return client.call(args[0], ...args.slice(1)) as any;
    },
    prefix,
  });
}

/**
 * General API rate limiting: 100 requests per minute per IP/user.
 */
export const generalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? "unknown",
  store: createRedisStore("rl:general:"),
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests. Please try again later.",
    },
  },
});

/**
 * Strict rate limiting for auth endpoints: 10 requests per minute per IP.
 */
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "unknown",
  store: createRedisStore("rl:auth:"),
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many auth attempts. Please try again later.",
    },
  },
});
