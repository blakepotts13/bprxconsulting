import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  releaseSchedule,
  selectReportRows,
} from "../lib/formulary-quarterly.mjs";

test("all four previews open at midnight Central on the 15th and close at quarter rollover", () => {
  for (const [day, utcHour, quarter, effective, rolloverHour] of [
    ["2026-12-15", "06", "2027-Q1", "2027-01-01", "06"],
    ["2027-03-15", "05", "2027-Q2", "2027-04-01", "05"],
    ["2027-06-15", "05", "2027-Q3", "2027-07-01", "05"],
    ["2027-09-15", "05", "2027-Q4", "2027-10-01", "05"],
  ]) {
    const opens = new Date(`${day}T${utcHour}:00:00Z`);
    assert.equal(releaseSchedule(new Date(opens - 1)).opens, false);
    assert.deepEqual(
      [
        releaseSchedule(opens).opens,
        releaseSchedule(opens).quarter,
        releaseSchedule(opens).effective,
      ],
      [true, quarter, effective],
    );
    const rollover = new Date(`${effective}T${rolloverHour}:00:00Z`);
    assert.equal(releaseSchedule(new Date(rollover - 1)).opens, true);
    assert.equal(releaseSchedule(rollover).opens, false);
    assert.equal(releaseSchedule(rollover).currentQuarter, quarter);
  }
});

test("bundled January preview lists only published comparisons, and searches the two quarters", () => {
  const report = JSON.parse(
    readFileSync(
      new URL("../formulary-reference/reports/2027-Q1.json", import.meta.url),
    ),
  );
  assert.equal(report.effective, "2027-01-01");
  assert.equal(report.previousQuarter, "2026-Q4");
  assert.ok(report.changes.hcpcs.length > 0);
  assert.equal(report.sources.crosswalk.upcoming, null);
  assert.equal(report.changes.crosswalk, undefined);
  const row = report.changes.hcpcs.find((change) => change.before === null);
  assert.deepEqual(
    selectReportRows(report, "hcpcs", row.id.toLowerCase(), 1).rows,
    [row],
  );
  const { rows, current, pages } = selectReportRows(
    report,
    "hcpcs",
    "",
    1000,
    10,
  );
  assert.equal(current, pages);
  assert.ok(rows.length && rows.length <= 10);
});
