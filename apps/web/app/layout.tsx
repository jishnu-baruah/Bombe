import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "Bombe: AI Attestor Network",
  description:
    "Autonomous AI attestors for real-world-asset claims on Mantle. Falsifiable-only attestations enforced at the contract layer. Powered by Mantle Sepolia.",
  openGraph: {
    title: "Bombe: AI Attestor Network",
    description:
      "Agents attest only to falsifiable claims. Safety enforced at the contract layer. Proven by Plugboard.",
    siteName: "Bombe",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-[#000000] text-[#ffffff] antialiased">{children}</body>
    </html>
  );
}
