import { Queue } from "bullmq";
import { logger } from "#api/utils/logger.js";
import { templateSubjects, templates } from "#infra/email/templates.js";

const EMAIL_QUEUE_NAME = "email";
const EMAIL_JOB_NAME = "send-email";

let emailQueue;

export const createEmailQueue = ({ redisClient, connection }) => {
  if (emailQueue) return emailQueue;

  emailQueue = new Queue(EMAIL_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: 1000,
      removeOnFail: 1000,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000
      }
    }
  });

  if (redisClient) {
    logger.info("Email queue initialized with shared Redis runtime");
  } else {
    logger.warn("Email queue initialized without shared Redis runtime handle");
  }

  return emailQueue;
};

export const enqueueEmail = async (payload, opts = {}) => {
  if (!emailQueue) {
    throw new Error("Email queue has not been initialized");
  }
  return emailQueue.add(EMAIL_JOB_NAME, payload, opts);
};

export const enqueueTemplatedEmail = async ({ to, templateName, templateArgs = [], subject }, opts = {}) => {
  const templateBuilder = templates[templateName];
  if (!templateBuilder) {
    throw new Error(`Unknown email template: ${templateName}`);
  }

  const html = templateBuilder(...templateArgs);
  const finalSubject = subject || templateSubjects[templateName] || "Notification";

  return enqueueEmail({ to, subject: finalSubject, html }, opts);
};

export const enqueueForgotPasswordEmail = async ({ to, name, resetLink }, opts = {}) => {
  return enqueueTemplatedEmail(
    {
      to,
      templateName: "forgotPasswordLink",
      templateArgs: [name || "User", resetLink]
    },
    opts
  );
};

export const enqueueEmailVerification = async ({ to, name, verificationLink }, opts = {}) => {
  return enqueueTemplatedEmail(
    {
      to,
      templateName: "emailVerification",
      templateArgs: [name || "User", verificationLink]
    },
    opts
  );
};

/**
 * Enqueues email with OTP for verification (e.g. email verify).
 * @param {{ to: string, name?: string, otp: string, purpose?: string }} params
 * @param {object} opts
 * @returns {Promise<import("bullmq").Job>}
 */
export const enqueueVerifyEmailOtp = async ({ to, name, otp, purpose = "email verification" }, opts = {}) => {
  return enqueueTemplatedEmail(
    {
      to,
      templateName: "otp",
      templateArgs: [otp, name || "User", purpose]
    },
    opts
  );
};

/**
 * Enqueues tenant invite email.
 * @param {{ to: string, inviteeName?: string, inviterName: string, tenantName: string, acceptLink: string, expiresInDays?: number }} params
 * @param {object} opts
 * @returns {Promise<import("bullmq").Job>}
 */
export const enqueueTenantInviteEmail = async (
  { to, inviteeName, inviterName, tenantName, acceptLink, expiresInDays = 7 },
  opts = {}
) => {
  return enqueueTemplatedEmail(
    {
      to,
      templateName: "tenantInvite",
      templateArgs: [inviteeName || "User", inviterName, tenantName, acceptLink, expiresInDays]
    },
    opts
  );
};

export const closeEmailQueue = async () => {
  if (emailQueue) {
    await emailQueue.close();
    emailQueue = undefined;
  }
};

export { EMAIL_QUEUE_NAME, EMAIL_JOB_NAME };
