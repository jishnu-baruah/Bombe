import type { MetadataRoute } from "next";

const SITE_URL = "https://bombe-web.vercel.app";

// Allow crawling the public pages; keep the operator console and raw API out of the index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/operator", "/api/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
