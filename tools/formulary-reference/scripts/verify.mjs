import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
const require = createRequire(import.meta.url);
const assetDir = new URL(
  "../../../formulary-reference/assets/",
  import.meta.url,
);
const initSqlJs = require(new URL("vendor/sql-wasm.js", assetDir).pathname);
const manifest = JSON.parse(
  fs.readFileSync(new URL("manifest.json", assetDir), "utf8"),
);
const bytes = Buffer.concat(
  manifest.database_chunks.map((chunk) =>
    fs.readFileSync(new URL(chunk.file, assetDir)),
  ),
);
assert.equal(
  crypto.createHash("sha256").update(bytes).digest("hex"),
  manifest.database_sha256,
);
const SQL = await initSqlJs({
  locateFile: (f) => new URL("vendor/" + f, assetDir).pathname,
});
const db = new SQL.Database(bytes);
const scalar = (sql) => db.exec(sql)[0].values[0][0];
assert.equal(scalar("PRAGMA integrity_check"), "ok");
assert.equal(scalar("SELECT count(*) FROM drugs"), manifest.counts.records);
assert.equal(scalar("SELECT count(*) FROM policies"), manifest.counts.policies);
assert.equal(manifest.counts.policies, 73);
assert.equal(manifest.counts.ngs_policies, 16);
assert.equal(manifest.counts.other_policies, 57);
assert.equal(manifest.counts.codes_with_diagnoses, 181);
assert.equal(
  scalar(
    "SELECT count(*) FROM policies p WHERE NOT EXISTS(SELECT 1 FROM policy_contractors pc WHERE pc.policy_id=p.id)",
  ),
  0,
  "Every imported article retains its contractor provenance",
);
assert.equal(
  scalar(
    "SELECT count(*) FROM drugs WHERE hcpcs NOT GLOB '[A-Z][0-9][0-9][0-9][0-9]'",
  ),
  0,
);
assert.equal(
  scalar(
    "SELECT count(*) FROM diagnosis dx LEFT JOIN policies p ON dx.policy_id=p.id WHERE p.id IS NULL",
  ),
  0,
);
assert.equal(
  scalar(
    "SELECT count(*) FROM drugs WHERE units_item IS NULL OR units_ndc IS NULL",
  ),
  0,
);
assert.equal(
  scalar("SELECT count(*) FROM policies WHERE effective>'2026-11-16'"),
  0,
);
// Published amounts stay at the HCPCS billing-unit level, without a second add-on.
assert.equal(
  scalar("SELECT amount_text FROM medicare_allowables WHERE hcpcs='J1756'"),
  "0.224",
);
assert.equal(
  scalar("SELECT amount_text FROM medicare_allowables WHERE hcpcs='J0897'"),
  "29.856",
);
assert.equal(
  scalar(
    "SELECT COUNT(*) FROM medicare_allowables WHERE hcpcs NOT GLOB '[A-Z][0-9][0-9][0-9][0-9]'",
  ),
  0,
);
assert.equal(
  scalar("SELECT amount_text FROM medicare_allowables WHERE hcpcs='A9606'"),
  null,
);
assert.equal(
  scalar(
    "SELECT COUNT(*) FROM drugs d JOIN medicare_allowables a ON d.hcpcs=a.hcpcs WHERE a.amount_text IS NOT NULL",
  ),
  manifest.counts.allowable_packages,
);
assert.equal(manifest.counts.allowable_hcpcs, 885);
assert.equal(manifest.counts.allowable_packages, 7520);
assert.equal(manifest.sources.allowables.effective, manifest.quarter_start);
assert.equal(manifest.sources.allowables.effective_end, manifest.quarter_end);
const embeddedManifest = JSON.parse(
  scalar("SELECT value FROM metadata WHERE key='manifest'"),
);
assert.equal(
  embeddedManifest.sources.allowables.sha256,
  manifest.sources.allowables.sha256,
);
assert.equal(
  embeddedManifest.counts.allowable_packages,
  manifest.counts.allowable_packages,
);
assert.ok(!Object.hasOwn(embeddedManifest, "database_chunks"));
const history = JSON.parse(
  fs.readFileSync(new URL("hcpcs-history.json", assetDir), "utf8"),
);
assert.equal(history.sources.length, 20);
assert.equal(
  history.sources.at(-1).quarter,
  manifest.quarter.replace(" ", "-"),
);
assert.equal(history.sources[0].quarter, "2022-Q1");
assert.ok(Object.keys(history.items).every((ndc) => /^\d{11}$/.test(ndc)));
for (const [ndc, codes] of [
  ["00009028003", ["J1030", "J1010"]],
  ["00009000302", ["J2930", "J2919"]],
]) {
  const rows = history.items[ndc];
  assert.deepEqual(
    rows.map((row) => row[2]),
    codes,
  );
  assert.equal(history.sources[rows[0][1]].quarter, "2024-Q1");
  assert.equal(history.sources[rows[1][0]].quarter, "2024-Q2");
}
const dom = new JSDOM(
  fs.readFileSync(new URL("index.html", assetDir), "utf8"),
  {
    runScripts: "outside-only",
    url: "https://reference.example/tools/formulary-reference/index.html?review=units",
  },
);
const w = dom.window;
w.initSqlJs = async () => SQL;
Object.defineProperty(w, "crypto", { value: crypto.webcrypto });
vm.runInContext(
  fs.readFileSync(new URL("data-loader.js", assetDir), "utf8"),
  dom.getInternalVMContext(),
);
w.fetch = async (url) => {
  if (url === "hcpcs-history.json")
    return { ok: true, json: async () => history };
  if (url.startsWith("manifest.json"))
    return { ok: true, json: async () => manifest };
  const chunk = fs.readFileSync(new URL(url, assetDir));
  return {
    ok: true,
    arrayBuffer: async () =>
      chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength),
  };
};
vm.runInContext(
  fs.readFileSync(new URL("app.js", assetDir), "utf8"),
  dom.getInternalVMContext(),
);
for (
  let attempt = 0;
  attempt < 200 && !vm.runInContext("state.db", dom.getInternalVMContext());
  attempt++
)
  await new Promise((r) => setTimeout(r, 25));
const $ = (id) => w.document.getElementById(id);
const evalIn = (code) => vm.runInContext(code, dom.getInternalVMContext());
const rows = () => evalIn("state.rows");
const setSearch = (q, mode = "all") => {
  evalIn("state.mode=" + JSON.stringify(mode));
  $("search").value = q;
  evalIn("resetPage()");
};
assert.equal(
  new URL(w.document.querySelector("a.brand").href).pathname,
  "/tools/formulary-reference/index.html",
);
assert.equal($("scope-filter").value, "a", "NGS Part A remains the default");
assert.equal(
  evalIn(
    'query("SELECT COUNT(*) AS n FROM policies p WHERE "+policyScope())[0].n',
  ),
  16,
);
assert.equal(
  evalIn("state.total"),
  308,
  "Direct review link opens all 308 flagged records",
);
assert.equal($("review-filter").value, "units");
assert.equal($("review-note").hidden, false);
assert.ok(evalIn("fetchRows(false).every(unitReview)"));
let exportedBlob, downloadName;
w.Blob = Blob;
w.URL.createObjectURL = (blob) => {
  exportedBlob = blob;
  return "blob:review-export";
};
w.URL.revokeObjectURL = () => {};
w.HTMLAnchorElement.prototype.click = function () {
  downloadName = this.download;
};
$("export").click();
const reviewCsv = await exportedBlob.text();
assert.equal(
  reviewCsv.split("\r\n").length,
  309,
  "Export includes all 308 rows, not just the visible page",
);
assert.equal(downloadName, "formulary-unit-review-2026-Q4.csv");
$("status-filter").value = "N";
$("status-filter").dispatchEvent(new w.Event("change"));
assert.ok(
  evalIn("state.total") > 0 && evalIn("state.total") < 308,
  "Review filter combines with OPPS filter",
);
assert.ok(
  rows().every(
    (r) => r.si === "N" && evalIn(`unitReview(${JSON.stringify(r)})`),
  ),
);
$("reset").click();
assert.equal(new URL(w.location.href).searchParams.has("review"), false);
assert.equal(evalIn("state.total"), 7802);
setSearch("J1756", "hcpcs");
assert.ok(rows().length >= 4);
assert.ok(
  rows().every(
    (r) => r.hcpcs === "J1756" && r.si === "N" && r.dosage === "1 MG",
  ),
);
setSearch("00517-2340-10", "ndc");
assert.equal(evalIn("state.total"), 1);
assert.equal(rows()[0].units_item, 100);
assert.equal(rows()[0].units_ndc, 1000);
setSearch("0517-2340-10", "ndc");
assert.equal(evalIn("state.total"), 1, "4-4-2 NDC normalization");
setSearch("5172340010", "ndc");
assert.match($("search-note").textContent, /ambiguous/);
setSearch("iron sucrose", "description");
assert.ok(rows().some((r) => r.hcpcs === "J1756"));
setSearch("M81.0", "icd");
assert.ok(evalIn("state.total") > 0);
assert.ok(rows().some((r) => r.hcpcs === "J0897"));
assert.match($("search-note").textContent, /co-listed/);
assert.ok(
  rows().every(
    (r) =>
      db.exec(
        `SELECT 1 FROM policy_hcpcs ph JOIN diagnosis dx ON ph.policy_id=dx.policy_id WHERE ph.hcpcs='${r.hcpcs}' AND dx.normalized LIKE '%M810%'`,
      ).length,
  ),
);
setSearch("M810", "icd");
assert.ok(evalIn("state.total") > 0, "Undotted ICD-10 search");
setSearch("' OR 1=1 --");
assert.equal(evalIn("state.total"), 0, "SQL input is bound, not interpolated");
assert.equal($("empty").hidden, false);
setSearch("");
$("status-filter").value = "G";
evalIn("resetPage()");
assert.ok(rows().length > 0);
assert.ok(rows().every((r) => r.si === "G"));
$("next").click();
assert.equal(evalIn("state.page"), 1);
$("prev").click();
assert.equal(evalIn("state.page"), 0);
$("status-filter").value = "other";
evalIn("resetPage()");
assert.ok(rows().every((r) => !["G", "K", "N", ""].includes(r.si)));
$("reset").click();
assert.equal(evalIn("state.total"), 7802);
assert.ok(
  evalIn("siBadge('K1')").includes("K1"),
  "Preserve actual other indicators",
);
setSearch("25021-0142-20", "ndc");
assert.match($("results-body").textContent, /Check unit conversion/);
assert.ok(evalIn("unitReview(state.rows[0])"));
// Native dialog behavior is the only browser feature stubbed by this DOM test.
for (const id of ["detail-dialog", "source-dialog"]) {
  $(id).showModal = function () {
    this.setAttribute("open", "");
  };
  $(id).close = function () {
    this.removeAttribute("open");
  };
}
$("results-body").querySelector("button").click();
assert.match($("detail-content").textContent, /Source conversion needs review/);
setSearch("J1756", "hcpcs");
$("results-body").querySelector("button").click();
assert.equal(
  $("detail-content").querySelector(".allowable-amount").textContent,
  "$0.224",
);
assert.match(
  $("detail-content").querySelector(".allowable-unit").textContent,
  /Per 1 MG/,
);
assert.match($("detail-content").textContent, /Medicare Allowable/);
assert.match($("detail-content").textContent, /not raw ASP/);
assert.match(
  $("detail-content").textContent,
  /not a coverage determination or a CAH reimbursement estimate/,
);
assert.match($("detail-content").textContent, /2026-10-01 through 2026-12-31/);
assert.ok(
  $("detail-content").querySelector(
    `a[href="${manifest.sources.allowables.url}"]`,
  ),
);
$("export").click();
const pricedCsv = await exportedBlob.text();
assert.match(pricedCsv, /Medicare Allowable \(USD per HCPCS billing unit/);
assert.match(pricedCsv, /"0.224","1 MG","2026-10-01","2026-12-31"/);
const missingId = scalar(
  "SELECT d.id FROM drugs d LEFT JOIN medicare_allowables a ON a.hcpcs=d.hcpcs WHERE a.hcpcs IS NULL LIMIT 1",
);
evalIn(`openDetail(${missingId})`);
assert.equal(
  $("detail-content").querySelector(".allowable-amount").textContent,
  "No numeric amount published",
);
assert.match($("detail-content").textContent, /does not mean \$0/);
setSearch("A9606", "hcpcs");
$("results-body").querySelector("button").click();
assert.match($("detail-content").textContent, /100% AWP/);
assert.match(
  $("detail-content").querySelector(".allowable-unit-warning").textContent,
  /Pricing file: 1 microCurie. Crosswalk: 1 mCi/,
);
assert.equal(
  $("detail-content").querySelector(".allowable-amount").textContent,
  "No numeric amount published",
);
setSearch("J0897", "hcpcs");
$("results-body").querySelector("button").click();
assert.match($("detail-content").textContent, /Inflation-adjusted coinsurance/);
assert.match($("detail-content").textContent, /ICD-10 group/);
assert.match($("detail-content").textContent, /Group numbers are independent/);
assert.ok($("detail-content").querySelector('a[href*="articleid=52399"]'));
setSearch("888867413689", "ndc");
$("results-body").querySelector("button").click();
assert.match($("detail-content").textContent, /alternate identifier/);

await evalIn("renderHcpcsHistory(state.selected, $('hcpcs-history'))");
assert.match(
  $("hcpcs-history").textContent,
  /Exact-NDC history is unavailable/,
);
assert.equal($("hcpcs-history").querySelector("table"), null);

for (const [ndc, active, old, otherOld, newUnit] of [
  ["00009-0280-03", "J1010", "J1030", "J1020", "1 MG"],
  ["00009-0003-02", "J2919", "J2930", "J2920", "5 MG"],
]) {
  setSearch(ndc, "ndc");
  $("results-body").querySelector("button").click();
  await evalIn("renderHcpcsHistory(state.selected, $('hcpcs-history'))");
  const panel = $("hcpcs-history");
  const timeline = panel.querySelector("tbody");
  assert.match(timeline.textContent, new RegExp(active));
  assert.match(timeline.textContent, new RegExp(newUnit));
  assert.match(timeline.textContent, new RegExp(old));
  assert.doesNotMatch(timeline.textContent, new RegExp(otherOld));
  assert.match(timeline.textContent, /Q1 2024/);
  assert.match(timeline.textContent, /Q2 2024/);
  assert.ok(
    timeline.querySelector('a[href*="april-2024-asp-ndc-hcpcs-crosswalk"]'),
  );
  assert.match(
    panel.querySelector(".history-decision").textContent,
    new RegExp(otherOld),
  );
  assert.match(
    panel.querySelector(".history-decision").textContent,
    /2024-04-01/,
  );
  assert.match(
    panel.querySelector(".history-decision").textContent,
    /2024-03-31/,
  );
}
setSearch("00517-2340-10", "ndc");
$("results-body").querySelector("button").click();
await evalIn("renderHcpcsHistory(state.selected, $('hcpcs-history'))");
assert.match($("hcpcs-history").textContent, /CMS listed J1756 for this NDC/);
assert.equal($("hcpcs-history").querySelector(".history-decision"), null);

setSearch("J7207", "hcpcs");
assert.ok(rows().length > 0);
assert.ok(
  rows().every((r) => r.policy_count === 0),
  "Other-contractor policy references stay out of the default NGS scope",
);
$("scope-filter").value = "both";
$("scope-filter").dispatchEvent(new w.Event("change"));
assert.equal(
  evalIn(
    'query("SELECT COUNT(*) AS n FROM policies p WHERE "+policyScope())[0].n',
  ),
  16,
  "NGS Both does not leak other contractors",
);
$("scope-filter").value = "other";
$("scope-filter").dispatchEvent(new w.Event("change"));
assert.equal(
  evalIn(
    'query("SELECT COUNT(*) AS n FROM policies p WHERE "+policyScope())[0].n',
  ),
  57,
);
assert.equal(new URL(w.location.href).searchParams.get("scope"), "other");
assert.equal($("scope-note").hidden, false);
assert.match(
  $("scope-note").textContent,
  /do not establish coverage for Illinois/,
);
assert.ok(rows().every((r) => r.policy_count > 0));
w.HTMLElement.prototype.scrollIntoView = function () {};
$("results-body").querySelector(".policy-button").click();
assert.match(
  $("detail-content").textContent,
  /Other contractor—reference only/,
);
assert.match(
  $("detail-content").textContent,
  /does not establish Illinois coverage/,
);
assert.ok($("detail-content").querySelector(".contractor-list li"));
assert.ok(
  $("detail-content").querySelector("details[open] .dx-list .dx-item"),
  "View ICD-10 codes expands a diagnosis group",
);
assert.ok(!$("detail-content").textContent.includes("NGS J6 · Illinois"));
$("export").click();
const otherCsv = await exportedBlob.text();
assert.match(otherCsv, /Selected policy scope/);
assert.match(otherCsv, /Other contractor—reference only/);
assert.match(otherCsv, /A56065/);
setSearch("D66", "icd");
assert.ok(
  evalIn('fetchRows(false).some(r=>r.hcpcs==="J7207")'),
  "Other-contractor diagnosis search includes the newly indexed article",
);
$("scope-filter").value = "a";
$("scope-filter").dispatchEvent(new w.Event("change"));
assert.ok(
  !evalIn('fetchRows(false).some(r=>r.hcpcs==="J7207")'),
  "New diagnosis relationships do not leak into Illinois results",
);
$("reset").click();
assert.equal($("scope-filter").value, "a");
assert.equal(new URL(w.location.href).searchParams.has("scope"), false);

$("sources-button").click();
assert.match($("source-content").textContent, /No patient information/);
assert.match($("source-content").textContent, /not included/);
assert.equal(
  w.document.querySelectorAll(".results-section thead th").length,
  7,
);
const corrupt = {
  ...manifest,
  database_chunks: manifest.database_chunks.map((c, i) =>
    i ? c : { ...c, sha256: "0".repeat(64) },
  ),
};
await assert.rejects(
  w.FormularyData.loadDatabase(corrupt),
  /verification failed/,
);
await assert.rejects(
  w.FormularyData.loadDatabase(manifest, async () => ({ ok: false })),
  /approved account/,
);
console.log(
  "PASS: database integrity, manifest checksum, public-code scope, exact & normalized NDC lookup, HCPCS & description search, ICD-10 co-listings, parameter safety, SI filters, pagination, unit flags, alternate IDs, policy notes, contractor provenance, scope isolation, new diagnosis relationships, scoped exports, exact Medicare Allowable amounts and units, pricing notes, missing rates, exact-NDC HCPCS history, and source disclosures.",
);
console.log("Dataset:", JSON.stringify(manifest.counts));
dom.window.close();
db.close();
