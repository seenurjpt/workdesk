import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { User } from "@/models/User";
import { assertAdmin } from "./admin";
import { toUserDTO } from "./serialize";
import type { UserSettingsDTO } from "@/lib/types";

// `cache` remembers a result for the length of ONE request, so the layout and the page share one
// session check and one read of the user, instead of each doing their own. Only used while
// rendering pages: server actions keep reading fresh data.
const sessionUserId = cache(async (): Promise<string | null> => (await auth())?.user?.id ?? null);

/** The signed-in person's whole record, read once per request. */
export const loadUserDoc = cache(async (id: string) => {
  await connectDb();
  return User.findById(id).lean();
});

/** Authenticates the current request. The returned id is the only userId services may trust. */
export async function requireUserId(): Promise<string> {
  const id = await sessionUserId();
  if (!id) redirect("/login");
  return id;
}

export async function requireUser(): Promise<UserSettingsDTO> {
  const id = await requireUserId();
  const doc = await loadUserDoc(id);
  if (!doc) redirect("/login");
  return toUserDTO(doc);
}

/**
 * For the admin panel. Anyone who is not an active administrator gets the ordinary "not found"
 * page, so the panel does not even confirm that it exists. Checked in the database every time.
 */
export async function requireAdminId(): Promise<string> {
  const id = await sessionUserId();
  if (!id) redirect("/admin/login");
  try {
    await assertAdmin(id);
  } catch {
    notFound();
  }
  return id;
}
