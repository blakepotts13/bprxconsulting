import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const asset = (name) =>
  readFileSync(
    new URL(`../formulary-reference/assets/${name}`, import.meta.url),
    "utf8",
  );
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const rel =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const relationships =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const sourcePath = "xl/worksheets/sheet1.xml";
const row = (number, values) =>
  `<row r="${number}">${values
    .map((value, i) =>
      value === null
        ? ""
        : `<c r="${"ABC"[i]}${number}" t="inlineStr"><is><t>${value}</t></is></c>`,
    )
    .join("")}</row>`;

function harness() {
  const dom = new JSDOM("", { runScripts: "outside-only" });
  const { window } = dom;
  window.TextDecoder = TextDecoder;
  window.TextEncoder = class {
    encode(value) {
      return window.Uint8Array.from(new TextEncoder().encode(value));
    }
  };
  window.eval(asset("vendor/fflate-0.8.2.js"));
  window.eval(asset("audit-workbook.js"));
  return { dom, audit: window.FormularyAudit, zip: window.fflate };
}

test("workbook audit preserves submitted values and flags ambiguous rows without assigning a code", () => {
  const { dom, audit, zip } = harness();
  try {
    const formulary = [
      row(1, ["Site formulary"]),
      row(2, ["Drug Description", "NDC #", "Billing HCPCS"]),
      row(3, ["=Literal description", "00009-0280-03", "J1030"]),
      row(4, ["Furosemide", "00143-9155-25", "J1938"]),
      row(5, ["Venofer", "0517-2340-10", null]),
      row(6, ["Ambiguous", "5172340010", "J1756"]),
      row(7, ["Unlisted", "99999999999", null]),
      row(8, ["Multiple", "00069130510", null]),
      row(9, ["Missing", null, "J1938"]),
      row(10, ["Insulin with overlapping mappings", "00002-7510-01", "J1817"]),
      row(11, ["Supplemental insulin only", "12345-0001-01", "J1815"]),
      row(12, ["Amoxicillin", "00093-2263-01", null]),
    ].join("");
    const other = `<worksheet xmlns="${ns}"><sheetData><row r="1"><c r="A1"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>`;
    const parts = {
      "[Content_Types].xml":
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
      "xl/workbook.xml": `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="Drugs" sheetId="1" r:id="rId1"/><sheet name="HCPCS Review" sheetId="2" r:id="rId2"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${relationships}"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`,
      [sourcePath]: `<worksheet xmlns="${ns}"><dimension ref="A1:C9"/><sheetData>${formulary}</sheetData></worksheet>`,
      "xl/worksheets/sheet2.xml": other,
    };
    const book = audit.openWorkbook(
      zip.zipSync(
        Object.fromEntries(
          Object.entries(parts).map(([key, value]) => [
            key,
            zip.strToU8(value),
          ]),
        ),
      ),
    );
    const sheet = audit.readSheet(book, book.sheets[0]);
    assert.equal(audit.guessHeader(sheet).row, 2);
    const columns = audit.headerFields(sheet, 2).guess;
    assert.equal(columns.ndc, 2);
    assert.equal(columns.hcpcs, 3);
    assert.equal(columns.description, 1);
    const index = audit.makeIndex({
      exec: () => [
        {
          values: [
            ["00009028003", "J1010", "Depo-Medrol"],
            ["00143915525", "J1938", "Furosemide"],
            ["00517234010", "J1756", "Venofer"],
            ["00069130510", "Q5105", "Epoetin"],
            ["00069130510", "Q5106", "Epoetin"],
            ["00002751001", "J1815", "Humalog", "supplemental"],
            ["00002751001", "J1817", "Humalog", "cms"],
            ["12345000101", "J1815", "Insulin", "supplemental"],
          ],
        },
      ],
    });
    const run = () =>
      audit.audit(
        book,
        audit.readSheet(book, book.sheets[0]),
        { ...columns, header: 2 },
        index,
        { quarter: "2026 Q4" },
        new Map([
          [
            "00093226301",
            {
              status: "assigned",
              hcpcs: "J8499",
              labelUrl:
                "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4c0f348a-a65d-409c-8668-207c82a5e3cb",
            },
          ],
        ]),
      );
    assert.deepEqual(
      Array.from(audit.missingNdcs(sheet, { ...columns, header: 2 }, index)),
      ["99999999999", "00093226301"],
    );
    const output = run();
    assert.deepEqual(
      { ...output.counts },
      { total: 10, matched: 1, different: 1, review: 8 },
    );
    assert.equal(output.reviewName, "HCPCS Review (2)");
    assert.equal(
      run().reviewName,
      output.reviewName,
      "Rerunning audit starts with the original workbook",
    );
    const result = zip.unzipSync(output.bytes);
    const xml = zip.strFromU8(result[sourcePath]);
    assert.match(
      xml,
      /<c r="D2" t="inlineStr"><is><t xml:space="preserve">Current HCPCS \(CMS\)/,
    );
    assert.match(
      xml,
      /<c r="(?:C3|D3)"[^>]*>[^]*J1030[^]*<c r="D3"[^>]*>[^]*J1010/,
    );
    assert.match(xml, /<c r="D5"[^>]*>[^]*J1756/);
    assert.doesNotMatch(xml, /r="D(?:[6-9]|10|11|12)"/);
    assert.match(xml, /r="E2"[^>]*>[^]*Assigned HCPCS \(DailyMed fallback\)/);
    assert.match(xml, /r="E12"[^>]*>[^]*J8499/);
    assert.equal(zip.strFromU8(result["xl/worksheets/sheet2.xml"]), other);
    const review = zip.strFromU8(result["xl/worksheets/bprx-audit.xml"]);
    assert.match(review, /Code differs/);
    assert.match(review, /Submitted HCPCS missing/);
    assert.match(review, /Ambiguous 10-digit NDC/);
    assert.match(review, /No CMS crosswalk listing/);
    assert.match(review, /NDC missing/);
    assert.match(review, /Multiple CMS codes.*Q5105, Q5106/);
    assert.match(
      review,
      /Verify insulin administration and HCPCS.*J1815 \(supplemental\), J1817 \(CMS\)/,
    );
    assert.match(review, /12345-0001-01.*J1815 \(supplemental\)/);
    assert.match(
      review,
      /DailyMed fallback assigned.*J8499.*dailymed.nlm.nih.gov/,
    );
    assert.match(
      review,
      /t="inlineStr"><is><t xml:space="preserve">=Literal description/,
    );
    assert.doesNotMatch(review, /<f>/);
  } finally {
    dom.window.close();
  }
});
