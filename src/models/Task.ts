import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const subtaskSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 200 },
    done: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { _id: true },
);

const taskSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ["todo", "in_progress", "blocked", "done"],
      default: "todo",
    },
    priority: { type: Number, enum: [1, 2, 3, 4], default: 4 },
    dueAt: Date,
    startAt: Date,
    allDay: { type: Boolean, default: false },
    reminders: [
      {
        at: { type: Date, required: true },
        /** Minutes before the due time, or null for a custom absolute time. */
        offsetMin: { type: Number, default: null },
        sentAt: Date,
        dismissedAt: Date,
      },
    ],
    remindersCustomized: { type: Boolean, default: false },
    tags: {
      type: [String],
      validate: (v: string[]) => v.length <= 20,
    },
    subtasks: [subtaskSchema],
    recurrence: {
      rrule: String,
      timezone: String,
      endsAt: Date,
    },
    recurrenceParentId: { type: Schema.Types.ObjectId },
    /** The next occurrence created when this one was completed (prevents duplicates). */
    recurrenceSpawnedId: { type: Schema.Types.ObjectId },
    waitingOn: {
      person: String,
      followUpAt: Date,
      note: String,
    },
    attachments: [
      {
        url: { type: String, required: true, maxlength: 2000 },
        title: { type: String, maxlength: 200 },
        kind: { type: String, enum: ["link", "jira", "confluence"], default: "link" },
      },
    ],
    linkedNoteIds: [{ type: Schema.Types.ObjectId }],
    sourceNoteId: { type: Schema.Types.ObjectId },
    timeSpentMinutes: { type: Number, default: 0 },
    timeEntries: [{ startedAt: Date, endedAt: Date, minutes: Number }],
    order: { type: Number, default: 0 },
    completedAt: Date,
    deletedAt: Date,
  },
  { timestamps: true },
);

taskSchema.index({ userId: 1, status: 1, dueAt: 1 });
taskSchema.index({ userId: 1, projectId: 1, order: 1 });
taskSchema.index({ userId: 1, tags: 1 });
taskSchema.index({ userId: 1, "waitingOn.followUpAt": 1 });
taskSchema.index({ userId: 1, deletedAt: 1 });
taskSchema.index({ userId: 1, "reminders.at": 1 });
taskSchema.index({ title: "text" });

export type TaskDoc = InferSchemaType<typeof taskSchema> & { _id: mongoose.Types.ObjectId };

export const Task: Model<TaskDoc> =
  (mongoose.models.Task as Model<TaskDoc>) ?? mongoose.model<TaskDoc>("Task", taskSchema);
