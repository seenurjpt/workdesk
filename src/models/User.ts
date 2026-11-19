import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    image: String,
    timezone: { type: String, default: "Asia/Kolkata" },
    theme: { type: String, enum: ["system", "light", "dark"], default: "system" },
    weekStartsOn: { type: Number, enum: [0, 1], default: 1 },
    workHours: {
      start: { type: String, default: "09:30" },
      end: { type: String, default: "18:00" },
    },
    /** "admin" can open the admin panel. Everyone else is a normal user. */
    role: { type: String, enum: ["user", "admin"], default: "user", index: true },
    /** A suspended account cannot sign in, and its open sessions stop working. */
    status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
    suspendedAt: Date,
    suspendedReason: { type: String, maxlength: 200 },
    lastLoginAt: Date,
    /** Extra task statuses the person added, in their order (the four built-in ones are not stored). */
    customStatuses: {
      type: [
        new Schema(
          {
            key: { type: String, required: true },
            name: { type: String, required: true, maxlength: 24 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    /** Saved order of every status except Done (built-in keys and custom keys). Empty = default. */
    statusOrder: { type: [String], default: [] },
    templatesSeeded: { type: Boolean, default: false },
    /** Which set of starter templates this account has received (see server/templates.ts). */
    templatesSeedVersion: Number,
    lastPurgeAt: Date,
    /** The running focus timer. Persisted so it survives reloads and other devices. */
    activeTimer: {
      taskId: Schema.Types.ObjectId,
      mode: { type: String, enum: ["stopwatch", "pomodoro"] },
      phase: { type: String, enum: ["work", "break"], default: "work" },
      phaseStartedAt: Date,
      startedAt: Date,
    },
    reminderPrefs: {
      defaultOffsetMin: { type: Number, default: 15 },
      quietHours: {
        enabled: { type: Boolean, default: false },
        start: { type: String, default: "22:00" },
        end: { type: String, default: "07:00" },
      },
      morningSummary: { type: Boolean, default: false },
      sound: {
        enabled: { type: Boolean, default: true },
        tone: { type: String, enum: ["chime", "bell", "pop"], default: "chime" },
        volume: { type: Number, default: 0.6 },
      },
    },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId };

// In development a hot reload keeps the old compiled model, so a new field in the schema would be
// silently dropped on save until the server restarts. Rebuild the model when not in production.
if (process.env.NODE_ENV === "development" && mongoose.models.User) mongoose.deleteModel("User");

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ?? mongoose.model<UserDoc>("User", userSchema);
