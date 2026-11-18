import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const noteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    title: { type: String, trim: true, maxlength: 200, default: "" },
    content: {
      type: Schema.Types.Mixed,
      default: { type: "doc", content: [{ type: "paragraph" }] },
    },
    plainText: { type: String, default: "" },
    tags: { type: [String], validate: (v: string[]) => v.length <= 20 },
    pinned: { type: Boolean, default: false },
    folder: { type: String, trim: true, maxlength: 80 },
    type: { type: String, enum: ["note", "meeting"], default: "note" },
    meeting: {
      date: Date,
      attendees: [String],
      agenda: String,
    },
    linkedTaskIds: [{ type: Schema.Types.ObjectId }],
    deletedAt: Date,
  },
  { timestamps: true },
);

noteSchema.index({ userId: 1, updatedAt: -1 });
noteSchema.index({ userId: 1, pinned: -1, updatedAt: -1 });
noteSchema.index({ userId: 1, deletedAt: 1 });
noteSchema.index({ userId: 1, tags: 1 });
noteSchema.index({ title: "text", plainText: "text" });

export type NoteDoc = InferSchemaType<typeof noteSchema> & { _id: mongoose.Types.ObjectId };

export const Note: Model<NoteDoc> =
  (mongoose.models.Note as Model<NoteDoc>) ?? mongoose.model<NoteDoc>("Note", noteSchema);
