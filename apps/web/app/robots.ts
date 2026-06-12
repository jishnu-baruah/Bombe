import type { MetadataRoute } from "next";

const SITE_URL = "https://bombe-web.vercel.app";

// Allow crawling the public pages and the keyless public READ API (so AI agents can
// discover and verify attestations), while keeping the operator console and any
// mutating/internal routes out of the index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        // Public, keyless GET endpoints agents use for discovery + verification.
        "/api/v1/schema",
        "/api/v1/assets",
        "/api/v1/discover",
        "/api/v1/verify",
        "/llms.txt",
      ],
      // Operator console plus mutating/internal routes stay out of the index.
      disallow: ["/operator", "/api/v1/request", "/api/v1/asset-request"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
