import "./globals.css";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { site } from "../lib/site";

export const metadata = {
  metadataBase: new URL(site.domain),
  title: {
    default: "BPRx Consulting | Pharmacist Driven Results",
    template: "%s | BPRx Consulting",
  },
  description: site.description,
  keywords: [
    "340B consultant",
    "hospital pharmacy consultant",
    "pharmacy operations consulting",
    "USP 797 consulting",
    "critical access hospital pharmacy",
  ],
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Header />
        <div id="main-content" tabIndex="-1">
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}
