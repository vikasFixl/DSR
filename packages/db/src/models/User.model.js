// src/db/models/User.model.js
import mongoose from "mongoose";
import { toJSONPlugin } from "../plugins/toJSON.plugin.js";

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    avatarUrl: {
      type: String,
      default: null,
    },

    auth: {
      passwordHash: {
        type: String,
        required: true,
      },
      passwordAlgo: {
        type: String,
        default: "bcrypt",
      },
      lastLoginAt: {
        type: Date,
        default: null,
      },
    },

    isPlatformAdmin: {
      type: Boolean,
      default: false,
      index: true,
    },

    status: {
      type: String,
      enum: ["active", "disabled", "locked"],
      default: "active",
      index: true,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0
    },
    lockedUntil: {
      type: Date,
      default: null
    },
    passwordChangedAt: {
      type: Date,
      default: null
    },
    emailVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    strict: true,
    minimize: false,
    optimisticConcurrency: true,
  }
);

UserSchema.plugin(toJSONPlugin);
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ name: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ emailVerified: 1 });
UserSchema.index({ isPlatformAdmin: 1 });
UserSchema.index({ createdAt: 1 });
UserSchema.index({ updatedAt: 1 });

export default mongoose.model("User", UserSchema);
