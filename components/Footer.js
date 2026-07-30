import Link from 'next/link';
import Logo from './Logo';
import { services } from '../lib/services';
import { site } from '../lib/site';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-grid shell">
        <div className="footer-intro">
          <Logo inverse />
          <p>Pharmacist-led solutions for hospital pharmacy operations, 340B compliance, regulatory readiness, and clinical technology.</p>
          <a href={`mailto:${site.email}`}>{site.email}</a>
        </div>
        <div><h3>Services</h3>{services.slice(0,4).map(s => <Link key={s.slug} href={`/services/${s.slug}`}>{s.title}</Link>)}</div>
        <div><h3>Company</h3><Link href="/about">About BPRx</Link><Link href="/resources">Resources</Link><Link href="/contact">Contact</Link><Link href="/privacy">Privacy</Link></div>
      </div>
      <div className="footer-bottom shell"><span>© {new Date().getFullYear()} BPRx Consulting. All rights reserved.</span><span>{site.tagline}</span></div>
    </footer>
  );
}
