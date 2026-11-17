/** Opt-in integration check; creates and deletes one development-only Clerk user. */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";

assert(
  process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"),
  "Use development Clerk keys only.",
);
const base = process.env.FORMULARY_TEST_BASE_URL || "http://localhost:3000";
const privateRoot = `${base}/tools/formulary-reference`;
// Scope preview credentials to this deployment; never send them to Clerk.
function siteFetch(url, options = {}) {
  const headers = new Headers(options.headers);
  if (
    new URL(base).hostname.endsWith(".vercel.app") &&
    process.env.VERCEL_OIDC_TOKEN
  ) {
    headers.set(
      "x-vercel-trusted-oidc-idp-token",
      process.env.VERCEL_OIDC_TOKEN,
    );
  }
  return fetch(url, { ...options, headers });
}
async function clerk(path, method = "GET", body) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert(response.ok, `Clerk ${method} ${path}: ${response.status}`);
  return response.json();
}
let testUser;
try {
  testUser = await clerk("/users", "POST", {
    email_address: [`formulary-${randomUUID()}+clerk_test@example.com`],
    skip_password_requirement: true,
  });
  const session = await clerk("/sessions", "POST", { user_id: testUser.id });
  const { jwt } = await clerk(`/sessions/${session.id}/tokens`, "POST", {});
  assert(jwt, "Clerk issued a session token");
  const options = {
    headers: { Authorization: `Bearer ${jwt}` },
    redirect: "manual",
  };
  assert.equal(
    (await siteFetch(base)).status,
    200,
    "Marketing site stays public",
  );
  assert.equal((await siteFetch(`${privateRoot}/database-01.bin`)).status, 401);
  assert.equal(
    (await siteFetch(`${privateRoot}/index.html`, { redirect: "manual" }))
      .status,
    303,
  );
  for (const file of [
    "index.html",
    "database-01.bin",
    "manifest.json",
    "vendor/sql-wasm.wasm",
  ]) {
    const response = await siteFetch(`${privateRoot}/${file}`, options);
    assert.equal(
      response.status,
      403,
      `Pending account: ${file}; Clerk reason ${response.headers.get("x-clerk-auth-reason")}`,
    );
  }
  await clerk(`/users/${testUser.id}/metadata`, "PATCH", {
    public_metadata: { formularyAccess: true },
  });
  const page = await siteFetch(`${privateRoot}/index.html`, options);
  assert.equal(page.status, 200, "Approved account receives lookup");
  assert.match(await page.text(), /Formulary Reference/i);
  const m = await siteFetch(`${privateRoot}/manifest.json`, options);
  assert.equal(m.status, 200);
  const manifest = await m.json();
  const parts = [];
  for (const chunk of manifest.database_chunks) {
    const r = await siteFetch(`${privateRoot}/${chunk.file}`, options);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("cache-control"), /private.*no-store/);
    const part = Buffer.from(await r.arrayBuffer());
    assert.equal(createHash("sha256").update(part).digest("hex"), chunk.sha256);
    parts.push(part);
  }
  assert.equal(
    createHash("sha256").update(Buffer.concat(parts)).digest("hex"),
    manifest.database_sha256,
  );
  assert.equal(
    (await siteFetch(`${privateRoot}/vendor/sql-wasm.wasm`, options)).status,
    200,
  );
  await clerk(`/users/${testUser.id}/metadata`, "PATCH", {
    public_metadata: { formularyAccess: false },
  });
  assert.equal(
    (await siteFetch(`${privateRoot}/database-01.bin`, options)).status,
    403,
    "Revocation takes effect on next request",
  );
  console.log(
    "PASS: real Clerk session → pending denied → approved HTML/WASM/database → immediate revocation; public marketing remains accessible.",
  );
} finally {
  if (testUser) {
    await clerk(`/users/${testUser.id}`, "DELETE");
    console.log("Deleted temporary development user and its sessions.");
  }
}
