import CTA from "../../components/CTA";
import { createPageMetadata } from "../../lib/metadata";
export const metadata = createPageMetadata({
  title: "About",
  description: "Learn about BPRx Consulting and its pharmacist-led approach.",
  path: "/about",
});
export default function About() {
  return (
    <main>
      <section className="page-hero">
        <div className="shell narrow">
          <p className="eyebrow light">ABOUT BPRx</p>
          <h1>Pharmacy consulting built around implementation.</h1>
          <p>
            BPRx Consulting was created to help pharmacy leaders solve complex
            problems with practical, pharmacist-led support.
          </p>
        </div>
      </section>
      <section className="section shell about-grid">
        <div>
          <p className="eyebrow">THE DIFFERENCE</p>
          <h2>Advice from the perspective of a pharmacy operator.</h2>
        </div>
        <div className="prose">
          <p>
            Hospital pharmacy leaders work at the intersection of patient care,
            compliance, technology, finance, and operations. Recommendations
            that ignore any one of those areas are difficult to implement and
            harder to sustain.
          </p>
          <p>
            BPRx focuses on the complete operating environment. Engagements
            begin with the real workflow, the available data, and the result the
            organization needs to achieve. Deliverables are designed for use by
            pharmacy staff, executive leadership, auditors, surveyors, and other
            stakeholders.
          </p>
          <p>
            The result is consulting that supports both immediate decisions and
            long-term program ownership.
          </p>
        </div>
      </section>
      <section className="dark-section">
        <div className="section shell">
          <p className="eyebrow light">CORE PRINCIPLES</p>
          <div className="value-grid">
            <article>
              <h3>Pharmacist-led</h3>
              <p>
                Clinical and operational judgment stays central to the work.
              </p>
            </article>
            <article>
              <h3>Independent</h3>
              <p>
                Recommendations are based on the organization’s needs rather
                than a vendor agenda.
              </p>
            </article>
            <article>
              <h3>Practical</h3>
              <p>
                Solutions must work with the staff, systems, and resources
                available.
              </p>
            </article>
            <article>
              <h3>Accountable</h3>
              <p>
                Findings connect to ownership, action, validation, and
                measurable progress.
              </p>
            </article>
          </div>
        </div>
      </section>
      <CTA />
    </main>
  );
}
