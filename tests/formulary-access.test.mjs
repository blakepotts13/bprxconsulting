import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { isApprovedFormularyUser } from "../lib/formulary-policy.mjs";
import { serveFormularyFile } from "../lib/formulary-files.mjs";
import { assignFallback, lookupDailymed } from "../lib/formulary-dailymed.mjs";

const approved = async () => ({ status: "approved" });
const assets = path.join(process.cwd(), "formulary-reference/assets");
const request = (file = "index.html", method = "GET") =>
  new Request(
    `https://www.bprxconsulting.com/tools/formulary-reference/${file}`,
    { method },
  );

test("approval requires server-controlled metadata or a verified allowlisted email", () => {
  assert.equal(isApprovedFormularyUser(null), false);
  assert.equal(isApprovedFormularyUser({}), false);
  assert.equal(
    isApprovedFormularyUser({ unsafeMetadata: { formularyAccess: true } }),
    false,
  );
  assert.equal(
    isApprovedFormularyUser({ publicMetadata: { formularyAccess: "true" } }),
    false,
  );
  assert.equal(
    isApprovedFormularyUser({ publicMetadata: { formularyAccess: true } }),
    true,
  );
  const user = {
    emailAddresses: [
      {
        emailAddress: "Owner@Example.com",
        verification: { status: "unverified" },
      },
    ],
  };
  assert.equal(isApprovedFormularyUser(user, "owner@example.com"), false);
  user.emailAddresses[0].verification.status = "verified";
  assert.equal(
    isApprovedFormularyUser(user, " owner@example.com, someone@example.com "),
    true,
  );
  user.publicMetadata = { formularyAccess: false };
  assert.equal(
    isApprovedFormularyUser(user, "owner@example.com"),
    false,
    "Explicit revocation overrides the bootstrap allowlist",
  );
});

test("anonymous users cannot read any reference asset", async () => {
  const signedOut = async () => ({ status: "signed-out" });
  const html = await serveFormularyFile(request(), ["index.html"], signedOut);
  assert.equal(html.status, 303);
  assert.equal(
    new URL(html.headers.get("Location")).pathname,
    "/tools/sign-in",
  );
  const audit = await serveFormularyFile(
    request("audit.html"),
    ["audit.html"],
    signedOut,
  );
  assert.equal(audit.status, 303);
  assert.equal(
    new URL(audit.headers.get("Location")).searchParams.get("redirect_url"),
    "/tools/formulary-reference/audit.html",
  );
  for (const file of [
    "manifest.json",
    "audit.js",
    "audit-workbook.js",
    "vendor/fflate-0.8.2.js",
    "hcpcs-history.json",
    "app.js",
    "data-loader.js",
    "j1815-packages.json",
    "dailymed.json",
    "style.css",
    "vendor/sql-wasm.wasm",
    "database-01.bin",
    "formulary.sqlite",
  ]) {
    const response = await serveFormularyFile(
      request(file),
      file.split("/"),
      signedOut,
    );
    assert.equal(response.status, 401, file);
    assert.match(response.headers.get("Cache-Control"), /private, no-store/);
  }
});

test("signed-in users without approval are denied, including when the provider is unavailable", async () => {
  for (const file of [
    "index.html",
    "manifest.json",
    "hcpcs-history.json",
    "j1815-packages.json",
    "dailymed.json",
    "vendor/sql-wasm.js",
    "database-01.bin",
  ]) {
    assert.equal(
      (
        await serveFormularyFile(request(file), file.split("/"), async () => ({
          status: "pending",
        }))
      ).status,
      403,
    );
    assert.equal(
      (
        await serveFormularyFile(request(file), file.split("/"), async () => ({
          status: "unavailable",
        }))
      ).status,
      503,
    );
  }
});

test("DailyMed fallback requires exact label verification and preserves specific-code review", async () => {
  const setid = "7a8d2539-4422-4312-0298-207ef1a2948e";
  const fixture = {
    product_ndc: "0409-3613",
    brand_name: "Bupivacaine Spinal",
    generic_name: "Bupivacaine hydrochloride in dextrose",
    packaging: [{ package_ndc: "0409-3613-01" }],
    product_type: "HUMAN PRESCRIPTION DRUG",
    marketing_category: "ANDA",
    route: ["SUBARACHNOID"],
    dosage_form: "INJECTION, SOLUTION",
    openfda: { spl_set_id: [setid] },
  };
  const mockFetch = async (value) => {
    const url = new URL(value);
    if (url.hostname === "api.fda.gov")
      return Response.json({ results: [fixture] });
    if (url.pathname.endsWith("/packaging.json"))
      return Response.json({
        data: {
          products: [
            {
              product_code: fixture.product_ndc,
              packaging: [{ ndc: "0409-3613-01" }],
            },
          ],
        },
      });
    if (url.pathname.endsWith("/spls.json"))
      return Response.json({ data: [{ setid }] });
    throw new Error(
      "A possible specific code should short-circuit fallback classification",
    );
  };
  const match = await lookupDailymed("00409361301", assets, mockFetch);
  assert.equal(match.status, "review");
  assert.ok(match.specificCodes.some(([code]) => code === "J0665"));
  assert.equal(match.hcpcs, undefined);

  const oral = { ...fixture, dosage_form: "TABLET", route: ["ORAL"] };
  assert.equal(assignFallback(oral, ["J01CA"], []).hcpcs, "J8499");
  assert.equal(assignFallback(fixture, ["N01BB"], []).hcpcs, "J3490");
  assert.equal(assignFallback(oral, ["L01BC"], []).hcpcs, undefined);
  assert.equal(assignFallback(oral, [], []).hcpcs, undefined);
  assert.equal(
    assignFallback({ ...fixture, marketing_category: "BLA" }, ["A10AB"], [])
      .hcpcs,
    undefined,
  );
  assert.equal(
    assignFallback({ ...oral, product_type: "HUMAN OTC DRUG" }, ["N02BE"], [])
      .hcpcs,
    undefined,
  );
  const invalid = await serveFormularyFile(
    request("dailymed.json?ndc=123"),
    ["dailymed.json"],
    approved,
  );
  assert.equal(invalid.status, 400);
});

test("supplemental packages are served only through the approved, uncached route", async (t) => {
  const fixture = [
    [
      "12345-0001-01",
      "Example insulin",
      "Example labeler",
      3,
      1,
      100,
      "FDA NDC Directory",
    ],
  ];
  const payload = JSON.stringify(fixture);
  const previous = process.env.FORMULARY_J1815_PACKAGES;
  t.after(() => {
    if (previous === undefined) delete process.env.FORMULARY_J1815_PACKAGES;
    else process.env.FORMULARY_J1815_PACKAGES = previous;
  });
  process.env.FORMULARY_J1815_PACKAGES = payload;
  const file = "j1815-packages.json";
  const response = await serveFormularyFile(request(file), [file], approved);
  assert.deepEqual(await response.json(), fixture);
  assert.match(response.headers.get("Cache-Control"), /private, no-store/);
  assert.match(response.headers.get("Vary"), /Cookie/);
});

test("approved users get complete, integrity-checked chunks under the response size limit", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(assets, "manifest.json"), "utf8"),
  );
  const downloaded = [];
  for (const chunk of manifest.database_chunks) {
    const response = await serveFormularyFile(
      request(chunk.file),
      [chunk.file],
      approved,
    );
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length <= 2 * 1024 * 1024);
    assert.equal(bytes.length, chunk.bytes);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      chunk.sha256,
    );
    assert.equal(
      response.headers.get("Content-Type"),
      "application/octet-stream",
    );
    assert.match(response.headers.get("Vary"), /Cookie/);
    assert.match(response.headers.get("Cache-Control"), /no-store/);
    downloaded.push(bytes);
  }
  assert.equal(
    createHash("sha256").update(Buffer.concat(downloaded)).digest("hex"),
    manifest.database_sha256,
  );
  const head = await serveFormularyFile(
    request(manifest.database_chunks[0].file, "HEAD"),
    [manifest.database_chunks[0].file],
    approved,
  );
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal(
    Number(head.headers.get("Content-Length")),
    manifest.database_chunks[0].bytes,
  );
});

test("filesystem traversal, secrets and an oversized whole-database response are never served", async () => {
  for (const segments of [
    ["..", ".env.local"],
    ["%2e%2e", ".env.local"],
    ["vendor", "..", "manifest.json"],
    ["formulary.sqlite"],
    ["vendor", "package.json"],
  ]) {
    const response = await serveFormularyFile(
      request(segments.join("/")),
      segments,
      approved,
    );
    assert.equal(response.status, 404, segments.join("/"));
  }
  const html = await serveFormularyFile(request(), ["index.html"], approved);
  assert.equal(html.status, 200);
  assert.match(html.headers.get("X-Robots-Tag"), /noindex/);
  assert.match(await html.text(), /Drug billing, in one place/);
});

test("no reference database or chunks are placed in Next.js public assets", async () => {
  const files = await readdir(path.join(process.cwd(), "public"), {
    recursive: true,
  });
  assert.ok(
    files.every((file) => !/formulary|database-\d+\.bin|\.sqlite$/i.test(file)),
  );
});
