import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormularyAccess } from "../../../lib/formulary-auth";
import {
  releaseSchedule,
  selectReportRows,
} from "../../../lib/formulary-quarterly.mjs";
import initialReport from "../../../formulary-reference/reports/2027-Q1.json";
import styles from "./updates.module.css";

const categories = {
  hcpcs: "HCPCS codes",
  crosswalk: "NDC mappings and billing units",
  pricing: "Medicare Allowable",
  opps: "OPPS status",
};
const sourcePages = {
  hcpcs:
    "https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system/quarterly-update",
  crosswalk:
    "https://www.cms.gov/medicare/payment/part-b-drugs/asp-pricing-files",
  pricing:
    "https://www.cms.gov/medicare/payment/part-b-drugs/asp-pricing-files",
  opps: "https://www.cms.gov/medicare/payment/prospective-payment-systems/hospital-outpatient-pps/quarterly-addenda-updates",
};
const dateLabel = (iso) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(iso));
const quarterLabel = (quarter) => `Q${quarter.at(-1)} ${quarter.slice(0, 4)}`;

async function getReport(quarter) {
  if (!/^\d{4}-Q[1-4]$/.test(quarter)) return null;
  try {
    const response = await fetch(
      `https://raw.githubusercontent.com/blakepotts13/bprxconsulting/cms-quarterly-data/${quarter}.json`,
      { next: { revalidate: 900 }, signal: AbortSignal.timeout(5000) },
    );
    if (response.ok) {
      const report = await response.json();
      if (report.quarter === quarter && report.sources && report.changes)
        return report;
    }
  } catch {
    // Use the bundled January report if the report archive is unreachable.
  }
  return initialReport.quarter === quarter ? initialReport : null;
}

export default async function FormularyUpdates({ searchParams }) {
  const access = await getFormularyAccess();
  if (access.status === "signed-out")
    redirect("/tools/sign-in?redirect_url=%2Ftools%2Fformulary-updates");
  if (access.status !== "approved")
    return (
      <main className="section shell narrow">
        <h1>
          {access.status === "unavailable"
            ? "Sign-in temporarily unavailable"
            : "Access awaiting approval"}
        </h1>
        <Link className="text-link" href="/tools/account">
          Your account
        </Link>
      </main>
    );

  const schedule = releaseSchedule();
  const query = await searchParams;
  const archive = query.view === "current";
  const quarter = archive ? schedule.currentQuarter : schedule.quarter;
  const report = archive || schedule.opens ? await getReport(quarter) : null;
  const category = Object.hasOwn(categories, query.category)
    ? query.category
    : "hcpcs";
  const search =
    typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const page =
    typeof query.page === "string" && /^\d+$/.test(query.page)
      ? Number(query.page)
      : 1;
  const { rows, total, pages, current } = selectReportRows(
    report,
    category,
    search,
    page,
  );
  const link = (kind, pageNo = 1) =>
    `?${new URLSearchParams({ ...(archive ? { view: "current" } : {}), category: kind, ...(search ? { q: search } : {}), ...(pageNo > 1 ? { page: pageNo } : {}) })}#changes`;

  return (
    <main className={`shell ${styles.workspace}`}>
      {/* The standalone reference document needs a full navigation. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a className="text-link" href="/tools/formulary-reference/index.html">
        ← Formulary Reference
      </a>
      <h1>Quarterly Medicare updates</h1>
      <p className={styles.intro}>
        Review upcoming code and billing changes before your team updates the
        formulary.
      </p>
      <nav className={styles.navigation} aria-label="Quarterly reports">
        <Link
          aria-current={archive ? undefined : "page"}
          href="/tools/formulary-updates"
        >
          Upcoming quarter
        </Link>
        <Link aria-current={archive ? "page" : undefined} href="?view=current">
          Current quarter report
        </Link>
      </nav>
      <section className={styles.panel} aria-labelledby="quarter-title">
        <h2 id="quarter-title">
          {quarterLabel(quarter)}{" "}
          {archive ? "change report" : "preview and change report"}
        </h2>
        <p>
          {archive
            ? "Changes compared with the prior quarter."
            : `CMS effective date ${dateLabel(schedule.effective)}. Preview publication ${dateLabel(schedule.previewDate)} (Central Time).`}
        </p>
        {!archive && !schedule.opens ? (
          <p className={styles.notice}>
            The preview opens on {dateLabel(schedule.previewDate)}. Available
            CMS files will be shown as they are processed.
          </p>
        ) : (
          <>
            {!archive && (
              <p className={styles.notice}>
                Upcoming quarter · For formulary preparation. Use the effective
                quarter for dates of service.
              </p>
            )}
            {!report && archive ? (
              <p>No archived change report is available for this quarter.</p>
            ) : (
              <ul className={styles.sources}>
                {Object.entries(categories).map(([key, label]) => {
                  const entry = report?.sources?.[key];
                  const ready = Array.isArray(report?.changes?.[key]);
                  return (
                    <li key={key}>
                      <strong>{label}</strong>
                      <span>
                        {ready
                          ? `${report.changes[key].length.toLocaleString("en-US")} changes`
                          : entry?.upcoming
                            ? "Comparison pending"
                            : report
                              ? "Awaiting CMS file"
                              : "Awaiting verified report"}
                      </span>
                      <a href={sourcePages[key]}>CMS source ↗</a>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>
      {report && (
        <section
          className={styles.panel}
          id="changes"
          aria-labelledby="changes-title"
        >
          <h2 id="changes-title">What changed</h2>
          <p>
            Compared with {quarterLabel(report.previousQuarter)}. HCPCS results
            cover J-codes and drug codes identified in the pricing or crosswalk
            data available for comparison.
          </p>
          <nav className={styles.navigation} aria-label="Change categories">
            {Object.entries(categories).map(([key, label]) => (
              <Link
                key={key}
                aria-current={category === key ? "page" : undefined}
                href={link(key)}
              >
                {label}
              </Link>
            ))}
          </nav>
          {Array.isArray(report.changes[category]) ? (
            <>
              <form className={styles.search} action="/tools/formulary-updates">
                {archive && <input name="view" type="hidden" value="current" />}
                <input name="category" type="hidden" value={category} />
                <label htmlFor="change-search">
                  Search changes by code, NDC, drug or description
                </label>
                <div>
                  <input
                    id="change-search"
                    name="q"
                    type="search"
                    defaultValue={search}
                    maxLength={100}
                  />
                  <button className="button button-small" type="submit">
                    Search
                  </button>
                </div>
              </form>
              <p>
                {total.toLocaleString("en-US")} change{total === 1 ? "" : "s"}
                {search ? ` matching “${search}”` : ""}
              </p>
              {!!rows.length && (
                <div className={styles.table}>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Code or NDC</th>
                        <th scope="col">Previous quarter</th>
                        <th scope="col">
                          {archive ? "Current" : "Upcoming"} quarter
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <th scope="row">
                            {row.id}
                            {row.name && <span>{row.name}</span>}
                          </th>
                          <td>{row.before ?? "Not listed"}</td>
                          <td>{row.after ?? "Not listed"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {pages > 1 && (
                <nav className={styles.navigation} aria-label="Result pages">
                  {current > 1 && (
                    <Link href={link(category, current - 1)}>Previous</Link>
                  )}
                  <span>
                    Page {current} of {pages}
                  </span>
                  {current < pages && (
                    <Link href={link(category, current + 1)}>Next</Link>
                  )}
                </nav>
              )}
            </>
          ) : (
            <p>
              This comparison will appear after both quarters’ files are
              available and processed.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
