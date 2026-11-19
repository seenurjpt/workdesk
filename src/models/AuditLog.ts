import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/** A record of something an administrator did. Written by the admin service, never edited. */
const auditLogSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, required: true, index: true },
    /** Kept as text so the entry still reads correctly after an account is deleted. */
    adminEmail: { type: String, required: true },
    action: { type: String, required: true, index: true },
    targetId: Schema.Types.ObjectId,
    targetEmail: String,
    detail: { type: String, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema> & { _id: mongoose.Types.ObjectId };

export const AuditLog: Model<AuditLogDoc> =
  (mongoose.models.AuditLog as Model<AuditLogDoc>) ??
  mongoose.model<AuditLogDoc>("AuditLog", auditLogSchema);
