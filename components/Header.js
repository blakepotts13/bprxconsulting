"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "./Logo";

const navigation = [
  { href: "/services/340b-program-consulting", label: "340B" },
  { href: "/services/hospital-pharmacy-operations", label: "Operations" },
  { href: "/services/regulatory-compliance", label: "Compliance" },
  { href: "/resources", label: "Resources" },
  { href: "/about", label: "About" },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="header-inner">
        <Logo />
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <Link className="button button-small" href="/contact">
          Request a Consultation
        </Link>
        <button
          type="button"
          className="mobile-menu-button"
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="menu-label">Menu</span>
          <span className="menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>
      <nav
        id="mobile-navigation"
        className="mobile-navigation"
        aria-label="Mobile navigation"
        hidden={!menuOpen}
      >
        <div className="mobile-navigation-inner shell">
          {navigation.map((item) => (
            <Link
              href={item.href}
              key={item.href}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <Link
            className="button"
            href="/contact"
            onClick={() => setMenuOpen(false)}
          >
            Request a Consultation
          </Link>
        </div>
      </nav>
    </header>
  );
}
