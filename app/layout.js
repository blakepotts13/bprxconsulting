import './globals.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { site } from '../lib/site';

export const metadata = {
  metadataBase: new URL(site.domain),
  title: { default: 'BPRx Consulting | Pharmacist Driven Results', template: '%s | BPRx Consulting' },
  description: site.description,
  keywords: ['340B consultant', 'hospital pharmacy consultant', 'pharmacy operations consulting', 'USP 797 consulting', 'critical access hospital pharmacy'],
  openGraph: {
    title: 'BPRx Consulting',
    description: site.description,
    url: site.domain,
    siteName: site.name,
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'BPRx Consulting — Pharmacist Driven Results' }]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BPRx Consulting',
    description: site.description,
    images: ['/og-image.png']
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png'
  },
  alternates: { canonical: '/' }
};

export default function RootLayout({ children }) {
  return <html lang="en"><body><Header />{children}<Footer /></body></html>;
}
