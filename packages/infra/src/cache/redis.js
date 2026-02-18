import { createClient } from "redis";
import { logger } from "#api/utils/logger.js";

let redisClient;

const buildRedisClient = ({ url, socket = {} }) => {
  if (redisClient) return redisClient;

  redisClient = createClient({
    url,
    socket: {
      ...socket,
      reconnectStrategy: (retries) => Math.min(retries * 100, 3000)
    }
  });

  redisClient.on("connect", () => {
    logger.info("Redis connecting");
  });

  redisClient.on("ready", () => {
    logger.info("Redis ready");
  });

  redisClient.on("reconnecting", () => {
    logger.warn("Redis reconnecting");
  });

  redisClient.on("error", (error) => {
    logger.error({ err: error }, "Redis error");
  });

  redisClient.on("end", () => {
    logger.warn("Redis connection ended");
  });

  return redisClient;
};

export const connectRedis = async ({ url, socket = {} }) => {
  const client = buildRedisClient({ url, socket });
  if (!client.isOpen) {
    await client.connect();
  }
  return client;
};

export const getRedisClient = () => redisClient;

export const disconnectRedis = async () => {
  if (redisClient?.isOpen) {
    await redisClient.quit();
  }
};

export const isRedisReady = async () => {
  if (!redisClient?.isOpen) return false;
  try {
    const pong = await redisClient.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
};
