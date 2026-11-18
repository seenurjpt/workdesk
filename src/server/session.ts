import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserSettings } from "./users";
import type { UserSettingsDTO } from "@/lib/types";

/** Authenticates the current request. The returned id is the only userId services may trust. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  return id;
}

export async function requireUser(): Promise<UserSettingsDTO> {
  const id = await requireUserId();
  const user = await getUserSettings(id);
  if (!user) redirect("/login");
  return user;
}
