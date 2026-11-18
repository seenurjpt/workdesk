import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const noteVersionSchema = new Schema({
  noteId: { type: Schema.Types.ObjectId, required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, default: "" },
  content: { type: Schema.Types.Mixed },
  savedAt: { type: Date, default: Date.now },
});

noteVersionSchema.index({ noteId: 1, savedAt: -1 });
noteVersionSchema.index({ userId: 1 });

export type NoteVersionDoc = InferSchemaType<typeof noteVersionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const NoteVersion: Model<NoteVersionDoc> =
  (mongoose.models.NoteVersion as Model<NoteVersionDoc>) ??
  mongoose.model<NoteVersionDoc>("NoteVersion", noteVersionSchema);
