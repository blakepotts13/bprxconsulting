import { adminContext } from "../../../../lib/users-access-auth";
import {
  AccessError,
  accessSnapshot,
  manageAccess,
  assertSameOrigin,
} from "../../../../lib/users-access.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie, Authorization",
  "X-Robots-Tag": "noindex, nofollow",
};
const json = (body, status = 200) => Response.json(body, { status, headers });
function failure(error) {
  return json(
    {
      error:
        error instanceof AccessError
          ? error.message
          : "Account services are temporarily unavailable. Refresh and try again.",
    },
    error instanceof AccessError ? error.status : 503,
  );
}
export async function GET(request) {
  try {
    const { client, user, config } = await adminContext();
    return json(
      await accessSnapshot(
        client,
        user,
        config,
        new URL(request.url).searchParams.get("q")?.trim() || "",
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request) {
  try {
    const { client, user, config } = await adminContext();
    assertSameOrigin(request);
    const text = await request.text();
    if (text.length > 16000)
      throw new AccessError("Request is too large.", 413);
    let input;
    try {
      input = JSON.parse(text);
    } catch {
      throw new AccessError("Invalid JSON.");
    }
    return json(
      await manageAccess(
        client,
        user,
        config,
        input,
        new URL(request.url).origin,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
