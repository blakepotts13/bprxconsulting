import { readFile } from "node:fs/promises";
import path from "node:path";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Authorization",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
};
const files = {
  "index.html": "text/html; charset=utf-8",
  "audit.html": "text/html; charset=utf-8",
  "audit.css": "text/css; charset=utf-8",
  "audit.js": "text/javascript; charset=utf-8",
  "audit-workbook.js": "text/javascript; charset=utf-8",
  "vendor/fflate-0.8.2.js": "text/javascript; charset=utf-8",
  "vendor/fflate-LICENSE": "text/plain; charset=utf-8",
  "app.js": "text/javascript; charset=utf-8",
  "data-loader.js": "text/javascript; charset=utf-8",
  "style.css": "text/css; charset=utf-8",
  "manifest.json": "application/json; charset=utf-8",
  "hcpcs-history.json": "application/json; charset=utf-8",
  "vendor/sql-wasm.js": "text/javascript; charset=utf-8",
  "vendor/sql-wasm.wasm": "application/wasm",
  "vendor/sql.js-LICENSE": "text/plain; charset=utf-8",
};

function messagePage(title, message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} | BPRx Consulting</title></head><body style="font:16px/1.6 system-ui,sans-serif;max-width:650px;margin:12vh auto;padding:24px;color:#183b32"><h1>${title}</h1><p>${message}</p><p><a href="/tools/account">Manage sign-in</a> · <a href="/contact">Contact BPRx Consulting</a> · <a href="/">Website home</a></p></body></html>`;
}

export async function serveFormularyFile(
  request,
  segments,
  authorize,
  directory = path.join(process.cwd(), "formulary-reference", "assets"),
) {
  const access = await authorize();
  const file = segments?.length ? segments.join("/") : "index.html";
  const documentRequest = file === "index.html" || file === "audit.html";
  const headers = { ...privateHeaders };
  if (access.status === "signed-out") {
    if (documentRequest) {
      const signIn = new URL("/tools/sign-in", request.url);
      signIn.searchParams.set(
        "redirect_url",
        file === "audit.html"
          ? "/tools/formulary-reference/audit.html"
          : "/tools/formulary-reference",
      );
      return new Response(null, {
        status: 303,
        headers: { ...headers, Location: signIn.toString() },
      });
    }
    return new Response("Sign in is required.", { status: 401, headers });
  }
  if (access.status !== "approved") {
    const unavailable = access.status === "unavailable";
    const title = unavailable
      ? "Sign-in temporarily unavailable"
      : "Approval required";
    const message = unavailable
      ? "Please try again shortly."
      : "Your account is signed in, but access to Formulary Reference has not been approved. Contact BPRx Consulting to request access.";
    return new Response(documentRequest ? messagePage(title, message) : title, {
      status: unavailable ? 503 : 403,
      headers: {
        ...headers,
        "Content-Type": documentRequest
          ? "text/html; charset=utf-8"
          : "text/plain; charset=utf-8",
      },
    });
  }
  if (file === "audit.html") {
    headers["Content-Security-Policy"] =
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
    headers["Referrer-Policy"] = "no-referrer";
  }
  // Use an explicit allowlist, not a caller-controlled filesystem path.
  const chunk = /^database-\d{2}\.bin$/.test(file);
  if (!Object.hasOwn(files, file) && !chunk)
    return new Response("Not found", { status: 404, headers });
  try {
    const bytes = await readFile(path.join(directory, file));
    return new Response(request.method === "HEAD" ? null : bytes, {
      headers: {
        ...headers,
        "Content-Type": files[file] || "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch {
    return new Response("Not found", { status: 404, headers });
  }
}
