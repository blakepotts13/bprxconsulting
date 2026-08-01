import { site } from "../lib/site";
import { services } from "../lib/services";
import { resources } from "../lib/resources";

const siteLastModified = "2026-07-29";

export default function sitemap() {
  const staticRoutes = [
    { path: "", changeFrequency: "monthly", priority: 1 },
    { path: "/about", changeFrequency: "yearly", priority: 0.6 },
    { path: "/contact", changeFrequency: "yearly", priority: 0.8 },
    { path: "/resources", changeFrequency: "monthly", priority: 0.8 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  ];

  return [
    ...staticRoutes.map(({ path, changeFrequency, priority }) => ({
      url: `${site.domain}${path}`,
      lastModified: siteLastModified,
      changeFrequency,
      priority,
    })),
    ...services.map((service) => ({
      url: `${site.domain}/services/${service.slug}`,
      lastModified: siteLastModified,
      changeFrequency: "yearly",
      priority: 0.8,
    })),
    ...resources.map((resource) => ({
      url: `${site.domain}/resources/${resource.slug}`,
      lastModified: resource.updatedAt,
      changeFrequency: "yearly",
      priority: 0.7,
    })),
  ];
}
