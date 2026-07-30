import Link from 'next/link';
import Logo from './Logo';

export default function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Logo />
        <nav className="desktop-nav" aria-label="Primary navigation">
          <Link href="/services/340b-program-consulting">340B</Link>
          <Link href="/services/hospital-pharmacy-operations">Operations</Link>
          <Link href="/services/regulatory-compliance">Compliance</Link>
          <Link href="/resources">Resources</Link>
          <Link href="/about">About</Link>
        </nav>
        <Link className="button button-small" href="/contact">Request a Consultation</Link>
      </div>
    </header>
  );
}
