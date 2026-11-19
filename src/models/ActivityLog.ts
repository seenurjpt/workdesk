import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/** Days an activity entry is kept. The database removes older ones by itself (TTL index). */
export const ACTIVITY_DAYS = 7;

/** One line of "what you did", shown to the person who did it. Private to that account. */
const activityLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    summary: { type: String, required: true, maxlength: 160 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: ACTIVITY_DAYS * 86_400 });

export type ActivityLogDoc = InferSchemaType<typeof activityLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ActivityLog: Model<ActivityLogDoc> =
  (mongoose.models.ActivityLog as Model<ActivityLogDoc>) ??
  mongoose.model<ActivityLogDoc>("ActivityLog", activityLogSchema);
