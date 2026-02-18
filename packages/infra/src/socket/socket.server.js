/**
 * Socket.IO server with JWT auth, Redis Pub/Sub subscription, and room-based delivery.
 * No direct emission from controllers; all real-time events flow through Redis.
 */

import { Server } from "socket.io";
import { verifyAccessToken } from "#api/modules/auth/auth.tokens.js";
import {
  createSubscriberClient,
  pSubscribe,
  disconnectSubscriber
} from "#infra/pubsub/subscriber.js";
import { pubsubChannels } from "#infra/cache/keys.js";
import { logger } from "#api/utils/logger.js";
import { config } from "#api/config/env.js";

const env = config.app.env;

/**
 * Creates and configures Socket.IO server with auth and Redis subscription.
 * @param {import('http').Server} httpServer
 * @param {{ redisUrl: string }} options
 * @returns {Promise<import('socket.io').Server>}
 */
export async function createSocketServer(httpServer, { redisUrl }) {
  const io = new Server(httpServer, {
    cors: { origin: config.cors.origin, credentials: true },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ??
      socket.handshake.query?.token ??
      socket.handshake.headers?.authorization?.replace?.(/^Bearer\s+/i, "");
    if (!token) {
      return next(new Error("Authentication required"));
    }
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      return next();
    } catch {
      return next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    socket.join(`user:${userId}`);
    logger.info({ userId, socketId: socket.id }, "Socket connected");

    socket.on("disconnect", (reason) => {
      logger.info({ userId, socketId: socket.id, reason }, "Socket disconnected");
    });

    socket.on("join:tenant", (tenantId) => {
      if (tenantId && typeof tenantId === "string") {
        socket.join(`tenant:${tenantId}`);
        logger.debug({ userId, tenantId }, "Joined tenant room");
      }
    });
  });

  const subscriberClient = await createSubscriberClient({ url: redisUrl });

  const auditPattern = pubsubChannels.auditCreatedPattern({ env });
  const notificationPattern = pubsubChannels.notificationCreatedPattern({ env });

  const handleMessage = (channel, message) => {
    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }

    if (channel.includes("audit.created")) {
      const tenantId = parsed.tenantId ?? "_";
      io.to(`tenant:${tenantId}`).emit("audit.created", parsed);
    } else if (channel.includes("notification.created")) {
      io.to(`user:${parsed.userId}`).emit("notification.created", parsed);
    }
  };

  await pSubscribe(subscriberClient, [auditPattern, notificationPattern], handleMessage);

  return Object.assign(io, {
    async close() {
      await disconnectSubscriber();
    }
  });
}
