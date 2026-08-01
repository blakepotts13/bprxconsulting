import { notFound } from "next/navigation";
import Link from "next/link";
import { resources, getResource } from "../../../lib/resources";
import CTA from "../../../components/CTA";
import { createPageMetadata } from "../../../lib/metadata";
export function generateStaticParams() {
  return resources.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const r = getResource(slug);
  return r
    ? createPageMetadata({
        title: r.title,
        description: r.excerpt,
        path: `/resources/${r.slug}`,
        type: "article",
      })
    : {};
}
export default async function Resource({ params }) {
  const { slug } = await params;
  const r = getResource(slug);
  if (!r) notFound();
  return (
    <main>
      <article>
        <header className="article-hero">
          <div className="shell article-width">
            <Link href="/resources" className="back-link">
              ← All resources
            </Link>
            <p className="eyebrow light">{r.category}</p>
            <h1>{r.title}</h1>
            <p>{r.excerpt}</p>
            <small>
              {r.date} · {r.readTime}
            </small>
          </div>
        </header>
        <div className="section shell article-width article-body">
          {r.sections.map(([h, p]) => (
            <section key={h}>
              <h2>{h}</h2>
              <p>{p}</p>
            </section>
          ))}
          <div className="article-note">
            <strong>Need support applying this to your organization?</strong>
            <p>
              BPRx can help assess current practice and build a practical
              improvement plan.
            </p>
            <Link href="/contact">Request a consultation →</Link>
          </div>
        </div>
      </article>
      <CTA />
    </main>
  );
}
