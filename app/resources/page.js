import Link from "next/link";
import { resources } from "../../lib/resources";
import { createPageMetadata } from "../../lib/metadata";
export const metadata = createPageMetadata({
  title: "Resources",
  description:
    "Practical resources for 340B, hospital pharmacy operations, and compliance.",
  path: "/resources",
});
export default function Resources() {
  return (
    <main>
      <section className="page-hero compact">
        <div className="shell narrow">
          <p className="eyebrow light">BPRx RESOURCES</p>
          <h1>Practical insight for pharmacy leaders.</h1>
          <p>
            Focused guidance on compliance, operations, technology, and
            performance.
          </p>
        </div>
      </section>
      <section className="section shell">
        <p className="eyebrow">TOOLS FOR APPROVED USERS</p>
        <h2>Formulary Reference</h2>
        <p>
          Search drug billing codes, package units, and Medicare policy
          references.
        </p>
        {/* This route returns a standalone HTML document and needs full navigation. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="button" href="/tools/formulary-reference">
          Sign in to Formulary Reference
        </a>
      </section>
      <section className="section shell">
        <div className="resource-grid large">
          {resources.map((r) => (
            <Link
              className="resource-card"
              href={`/resources/${r.slug}`}
              key={r.slug}
            >
              <span>{r.category}</span>
              <h3>{r.title}</h3>
              <p>{r.excerpt}</p>
              <small>
                {r.date} · {r.readTime}
              </small>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
