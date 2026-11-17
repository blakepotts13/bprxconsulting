import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isApprovedFormularyUser } from "./formulary-policy.mjs";

export async function getFormularyAccess() {
  try {
    const { userId } = await auth();
    if (!userId) return { status: "signed-out" };
    const user = await currentUser();
    if (!user) return { status: "signed-out" };
    return {
      status: isApprovedFormularyUser(
        user,
        process.env.FORMULARY_APPROVED_EMAILS,
      )
        ? "approved"
        : "pending",
    };
  } catch {
    // Provider outages and missing configuration never open the reference files.
    return { status: "unavailable" };
  }
}
