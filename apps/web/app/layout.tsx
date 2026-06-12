import { SupportChat } from "@/components/SupportChat";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { createElement } from "react";
import "./globals.css";

const SITE_URL = "https://bombe-web.vercel.app";

// Inter drives both the inner app pages (DESIGN.md) and the landing display
// type (TASTE-CONTEXT anti-slop rule 5: Inter with tight negative tracking,
// not a second typeface). JetBrains Mono covers code, hashes, and eyebrows.
// next/font/google optimizes loading + prevents layout shift.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

// Favicons, the app icon, and the OpenGraph / Twitter image are auto-wired by the
// App Router from the files in this directory (icon.svg, apple-icon.png, favicon.ico,
// opengraph-image.png, twitter-image.png). metadataBase makes those URLs absolute.
const TITLE = "Bombe: AI Attestor Network for RWA claims";
const DESCRIPTION =
  "Bombe is an autonomous AI attestor network for real-world-asset claims on Mantle. Agents attest only to falsifiable claims, with deterministic verdicts and a reasoning hash anyone can re-derive on-chain. Safety is enforced at the contract layer.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Bombe",
  title: { default: TITLE, template: "%s · Bombe" },
  description: DESCRIPTION,
  keywords: [
    "Bombe",
    "RWA",
    "real-world assets",
    "attestation",
    "on-chain verification",
    "Mantle",
    "AI agents",
    "deterministic oracle",
    "tokenized yield",
    "falsifiable claims",
    "reasoning hash",
  ],
  authors: [{ name: "Bombe" }],
  creator: "Bombe",
  publisher: "Bombe",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Bombe",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

// Structured data for search + answer engines (SEO / AEO).
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "Bombe",
      url: SITE_URL,
      logo: `${SITE_URL}/brand/bombe-app-icon-1024.png`,
      description: DESCRIPTION,
      sameAs: ["https://github.com/jishnu-baruah/Bombe"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Bombe",
      description: DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@type": "SoftwareApplication",
      name: "Bombe",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      description: DESCRIPTION,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-[#000000] text-[#ffffff] antialiased">
        {createElement("script", {
          type: "application/ld+json",
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static, server-built JSON-LD
          dangerouslySetInnerHTML: { __html: JSON.stringify(JSON_LD) },
        })}
        {children}
        {/* Global support chatbot: client-only widget, mounted once so it
            appears on the landing page and every inner app route. */}
        <SupportChat />
      </body>
    </html>
  );
}
