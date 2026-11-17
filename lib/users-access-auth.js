import "server-only";
import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { AccessError, requireAdmin, isAccessAdmin } from "./users-access.mjs";

export function accessConfig() {
  return {
    adminEmails: process.env.FORMULARY_ADMIN_EMAILS || "",
    approvedEmails: process.env.FORMULARY_APPROVED_EMAILS || "",
  };
}

export async function getAccessAdministrator() {
  try {
    const { userId } = await auth();
    if (!userId) return null;
    const user = await currentUser();
    return isAccessAdmin(user, accessConfig().adminEmails) ? user : null;
  } catch {
    return null;
  }
}

export async function adminContext() {
  try {
    const { userId } = await auth();
    const user = userId ? await currentUser() : null;
    const config = accessConfig();
    requireAdmin(user, config);
    return { user, config, client: await clerkClient() };
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError(
      "Account services are temporarily unavailable. Try again shortly.",
      503,
    );
  }
}
