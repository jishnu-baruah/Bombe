import type { MetadataRoute } from "next";

const SITE_URL = "https://bombe-web.vercel.app";

// Public, indexable surfaces (the operator console is intentionally excluded).
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/live", "/verify", "/issuers", "/integrate", "/request"];
  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    changeFrequency: "weekly",
    priority: route === "" ? 1 : 0.8,
  }));
}
