import bcrypt from "bcryptjs";
import { connectDb } from "@/lib/db";
import { User } from "@/models/User";
import type { RegisterInput, SettingsInput } from "@/schemas";
import type { UserSettingsDTO } from "@/lib/types";
import { toUserDTO } from "./serialize";

export async function registerUser(input: RegisterInput): Promise<{ id: string }> {
  await connectDb();
  const existing = await User.exists({ email: input.email });
  if (existing) throw new Error("An account with this email already exists");
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({ name: input.name, email: input.email, passwordHash });
  return { id: String(user._id) };
}

export async function getUserSettings(userId: string): Promise<UserSettingsDTO | null> {
  await connectDb();
  const user = await User.findById(userId).lean();
  return user ? toUserDTO(user) : null;
}

export async function updateUserSettings(
  userId: string,
  patch: SettingsInput,
): Promise<UserSettingsDTO | null> {
  await connectDb();
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: patch },
    { returnDocument: "after" },
  ).lean();
  return user ? toUserDTO(user) : null;
}
