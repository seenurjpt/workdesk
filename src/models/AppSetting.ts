import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/** Site-wide switches an administrator can change, one document per key. */
const appSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export type AppSettingDoc = InferSchemaType<typeof appSettingSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AppSetting: Model<AppSettingDoc> =
  (mongoose.models.AppSetting as Model<AppSettingDoc>) ??
  mongoose.model<AppSettingDoc>("AppSetting", appSettingSchema);
