import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const templateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    kind: { type: String, enum: ["task_checklist", "meeting_note", "note"], required: true },
    /** Shape depends on `kind`; validated by the Zod schema on write. */
    payload: { type: Schema.Types.Mixed, required: true },
    /** One of the starter templates created on first use. */
    system: { type: Boolean, default: false },
  },
  { timestamps: true },
);

templateSchema.index({ userId: 1, kind: 1, name: 1 });

export type TemplateDoc = InferSchemaType<typeof templateSchema> & { _id: mongoose.Types.ObjectId };

export const Template: Model<TemplateDoc> =
  (mongoose.models.Template as Model<TemplateDoc>) ??
  mongoose.model<TemplateDoc>("Template", templateSchema);
