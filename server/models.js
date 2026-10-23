import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["member", "admin"], default: "member", required: true },
    emailVerified: { type: Boolean, default: false, required: true },
    suspended: { type: Boolean, default: false, required: true },
    sessionVersion: { type: Number, default: 0, required: true },
    emailVerificationTokenHash: { type: String, select: false },
    emailVerificationExpiresAt: { type: Date, select: false },
    emailVerificationSentAt: { type: Date, select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    passwordResetSentAt: { type: Date, select: false },
  },
  { timestamps: true },
);
const entrySchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: ["need", "offer"],
      required: true,
      immutable: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 90 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    category: {
      type: String,
      enum: ["Food", "Clothing", "Shelter", "Education", "Healthcare", "Other"],
      required: true,
      index: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      index: true,
    },
    urgency: {
      type: String,
      enum: ["Normal", "High", "Critical"],
      default: "Normal",
    },
    quantity: { type: Number, required: true, min: 1, max: 100000 },
    status: {
      type: String,
      enum: ["Open", "Available", "Fulfilled", "Cancelled"],
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);
entrySchema.index({ kind: 1, status: 1, category: 1, location: 1 });
export const User = mongoose.models.User || mongoose.model("User", userSchema);
export const Entry =
  mongoose.models.Entry || mongoose.model("Entry", entrySchema);
