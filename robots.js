import Link from 'next/link';
import { services } from '../lib/services';
import { resources } from '../lib/resources';
import CTA from '../components/CTA';

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="hero-grid shell">
          <div className="hero-copy">
            <p className="eyebrow light">PHARMACIST DRIVEN RESULTS</p>
            <h1>Specialized pharmacy expertise for complex operational problems.</h1>
            <p className="hero-lead">BPRx helps hospitals and health systems strengthen 340B compliance, improve pharmacy operations, prepare for regulatory review, and optimize clinical technology.</p>
            <div className="button-row"><Link className="button button-light" href="/contact">Request a Consultation</Link><Link className="button button-ghost" href="#services">Explore Services</Link></div>
          </div>
          <div className="hero-panel">
            <span className="panel-kicker">BPRx APPROACH</span>
            <div className="panel-step"><b>01</b><span><strong>Understand the real workflow</strong><small>Not just the written policy or system design.</small></span></div>
            <div className="panel-step"><b>02</b><span><strong>Connect clinical, operational, and financial data</strong><small>Identify the actual drivers of performance and risk.</small></span></div>
            <div className="panel-step"><b>03</b><span><strong>Build solutions your team can sustain</strong><small>Practical tools, ownership, and measurable follow-through.</small></span></div>
          </div>
        </div>
        <div className="hero-stat shell"><span>Independent</span><span>Pharmacist-led</span><span>Hospital-focused</span><span>Implementation-minded</span></div>
      </section>

      <section className="section shell intro-section"><div><p className="eyebrow">CONSULTING FOR PHARMACY LEADERS</p><h2>Expert support without adding permanent overhead.</h2></div><p>Projects are scoped around your organization’s priorities, systems, and resources. The goal is not a generic report—it is a defensible, usable solution that improves how the pharmacy operates.</p></section>

      <section id="services" className="section shell">
        <div className="section-head"><div><p className="eyebrow">SERVICES</p><h2>Focused expertise across pharmacy’s highest-impact work.</h2></div></div>
        <div className="services-list">{services.map((service, i) => <Link className="service-row" href={`/services/${service.slug}`} key={service.slug}><span className="service-index">0{i+1}</span><span><h3>{service.title}</h3><p>{service.short}</p></span><span className="arrow">↗</span></Link>)}</div>
      </section>

      <section className="dark-section"><div className="section shell split"><div><p className="eyebrow light">WHY BPRx</p><h2>Recommendations grounded in real pharmacy leadership.</h2><p className="large-copy">BPRx approaches each engagement from the perspective of the person who must implement the change, answer the audit question, explain the variance, and keep the department operating.</p></div><div className="principles"><article><span>01</span><h3>Operationally realistic</h3><p>Solutions account for staffing, technology, competing priorities, and the realities of smaller health systems.</p></article><article><span>02</span><h3>Evidence-driven</h3><p>Findings are tied to source data, observed workflow, regulatory requirements, and measurable outcomes.</p></article><article><span>03</span><h3>Designed for ownership</h3><p>Deliverables clarify responsibility, cadence, documentation, and the next decision—not just the current finding.</p></article></div></div></section>

      <section className="section shell results-section"><div className="result-card"><strong>Compliance</strong><span>Turn requirements into documented, repeatable controls.</span></div><div className="result-card"><strong>Efficiency</strong><span>Remove workflow friction and redirect staff time to higher-value work.</span></div><div className="result-card"><strong>Financial stewardship</strong><span>Improve visibility into drug spend, revenue, waste, and savings.</span></div><div className="result-card"><strong>Leadership clarity</strong><span>Translate pharmacy performance into decisions executives can act on.</span></div></section>

      <section className="section shell resource-section"><div className="section-head"><div><p className="eyebrow">INSIGHTS</p><h2>Resources for pharmacy leaders.</h2></div><Link className="text-link" href="/resources">View all resources →</Link></div><div className="resource-grid">{resources.map(r => <Link className="resource-card" href={`/resources/${r.slug}`} key={r.slug}><span>{r.category}</span><h3>{r.title}</h3><p>{r.excerpt}</p><small>{r.readTime}</small></Link>)}</div></section>
      <CTA />
    </main>
  );
}
