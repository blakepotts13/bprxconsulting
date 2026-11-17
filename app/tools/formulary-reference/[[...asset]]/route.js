import { getFormularyAccess } from "../../../../lib/formulary-auth";
import { serveFormularyFile } from "../../../../lib/formulary-files.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { asset } = await params;
  // An explicit document URL keeps relative script and data URLs inside this route.
  if (!asset?.length) {
    const target = new URL(request.url);
    target.pathname = "/tools/formulary-reference/index.html";
    return new Response(null, {
      status: 307,
      headers: {
        Location: target.toString(),
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }
  return serveFormularyFile(request, asset, getFormularyAccess);
}

export const HEAD = GET;
