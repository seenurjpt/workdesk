"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";
import { objectId } from "@/schemas";
import {
  AdminError,
  createUserByAdmin,
  deleteUser,
  purgeExpiredTrash,
  resetUserPassword,
  setRegistration,
  setUserRole,
  setUserStatus,
} from "./admin";

/**
 * Server actions for the admin panel. Each one signs the caller in from the session, validates the
 * input, and calls a service that checks again, in the database, that the caller is an administrator.
 */

async function adminRun<T>(fn: (adminId: string) => Promise<T>): Promise<ActionResult<T>> {
  const session = await auth();
  const adminId = session?.user?.id;
  if (!adminId) return { ok: false, error: "You are signed out" };
  try {
    const data = await fn(adminId);
    revalidatePath("/admin", "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof z.ZodError)
      return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    if (e instanceof AdminError) return { ok: false, error: e.message };
    console.error("[admin action]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["user", "admin"]).default("user"),
});

export async function adminCreateUserAction(raw: unknown) {
  return adminRun((id) => createUserByAdmin(id, createSchema.parse(raw)));
}

const statusSchema = z.object({
  id: objectId,
  status: z.enum(["active", "suspended"]),
  reason: z.string().trim().max(200).optional(),
});

export async function adminSetStatusAction(raw: unknown) {
  return adminRun(async (id) => {
    const { id: target, status, reason } = statusSchema.parse(raw);
    await setUserStatus(id, target, status, reason || undefined);
    return null;
  });
}

const roleSchema = z.object({ id: objectId, role: z.enum(["user", "admin"]) });

export async function adminSetRoleAction(raw: unknown) {
  return adminRun(async (id) => {
    const { id: target, role } = roleSchema.parse(raw);
    await setUserRole(id, target, role);
    return null;
  });
}

export async function adminResetPasswordAction(raw: unknown) {
  return adminRun(async (id) => {
    const { id: target } = z.object({ id: objectId }).parse(raw);
    return { password: await resetUserPassword(id, target) };
  });
}

const deleteSchema = z.object({ id: objectId, confirmEmail: z.string().trim().max(200) });

export async function adminDeleteUserAction(raw: unknown) {
  return adminRun(async (id) => {
    const { id: target, confirmEmail } = deleteSchema.parse(raw);
    await deleteUser(id, target, confirmEmail);
    return null;
  });
}

export async function adminSetRegistrationAction(raw: unknown) {
  return adminRun(async (id) => {
    const { open } = z.object({ open: z.boolean() }).parse(raw);
    await setRegistration(id, open);
    return null;
  });
}

export async function adminPurgeTrashAction() {
  return adminRun((id) => purgeExpiredTrash(id));
}
