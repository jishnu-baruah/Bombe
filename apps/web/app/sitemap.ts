import type { MetadataRoute } from "next";

const SITE_URL = "https://bombe-web.vercel.app";

// Public, indexable surfaces (the operator console is intentionally excluded).
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/live", "/explorer", "/verify", "/issuers", "/integrate", "/request"];
  const human: MetadataRoute.Sitemap = pages.map((route) => ({
    url: `${SITE_URL}${route}`,
    changeFrequency: "weekly",
    priority: route === "" ? 1 : 0.8,
  }));

  // Agent entry points: the live capability registry and the agent-facing summary,
  // so crawlers and AI agents can find the keyless JSON API and MCP server.
  const agent: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/api/v1/schema`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/llms.txt`, changeFrequency: "weekly", priority: 0.9 },
  ];

  return [...human, ...agent];
}
