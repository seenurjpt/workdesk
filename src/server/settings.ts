import { connectDb } from "@/lib/db";
import { AppSetting } from "@/models/AppSetting";

/** Can new people create an account? Open unless an administrator closed it. */
export async function getRegistrationOpen(): Promise<boolean> {
  await connectDb();
  const doc = await AppSetting.findOne({ key: "registrationOpen" }).lean();
  return doc?.value !== false;
}

export async function setRegistrationOpen(open: boolean): Promise<void> {
  await connectDb();
  await AppSetting.updateOne(
    { key: "registrationOpen" },
    { $set: { value: open } },
    { upsert: true },
  );
}

/** Email addresses that become administrators when they sign in (ADMIN_EMAILS, comma separated). */
export function adminEmailsFromEnv(env: string | undefined = process.env.ADMIN_EMAILS): string[] {
  return (env ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
