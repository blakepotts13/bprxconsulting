import { notFound } from "next/navigation";
import Link from "next/link";
import { services, getService } from "../../../lib/services";
import CTA from "../../../components/CTA";
import { createPageMetadata } from "../../../lib/metadata";

export function generateStaticParams() {
  return services.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const service = getService(slug);
  return service
    ? createPageMetadata({
        title: service.title,
        description: service.short,
        path: `/services/${service.slug}`,
      })
    : {};
}

export default async function ServicePage({ params }) {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) notFound();
  return (
    <main>
      <section className="page-hero">
        <div className="shell narrow">
          <p className="eyebrow light">{service.eyebrow}</p>
          <h1>{service.title}</h1>
          <p>{service.summary}</p>
          <Link className="button button-light" href="/contact">
            Discuss Your Project
          </Link>
        </div>
      </section>
      <section className="section shell service-detail">
        <div>
          <p className="eyebrow">CAPABILITIES</p>
          <h2>Support matched to your program and priorities.</h2>
        </div>
        <div className="capability-grid">
          {service.capabilities.map((x, i) => (
            <div key={x}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <p>{x}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="soft-section">
        <div className="section shell">
          <p className="eyebrow">ENGAGEMENT APPROACH</p>
          <h2>A practical path from concern to sustained improvement.</h2>
          <div className="process-grid">
            {service.process.map(([title, text], i) => (
              <article key={title}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section shell">
        <div className="outcome-panel">
          <div>
            <p className="eyebrow light">EXPECTED OUTCOMES</p>
            <h2>Work designed to create visible, defensible progress.</h2>
          </div>
          <ul>
            {service.outcomes.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </section>
      <CTA />
    </main>
  );
}
