import { site } from "./site";

const socialImage = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "BPRx Consulting — Pharmacist Driven Results",
};

export function createPageMetadata({
  title,
  description,
  path = "/",
  absoluteTitle = false,
  type = "website",
}) {
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: site.name,
      type,
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
  };
}
