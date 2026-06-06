import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter is the body/UI font per DESIGN.md (Aeonik Pro substitute).
// next/font/google optimizes loading + prevents layout shift.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bombe — AI Attestor Network",
  description:
    "Autonomous AI attestors for real-world-asset claims on Mantle. Falsifiable-only attestations enforced at the contract layer. Powered by Mantle Sepolia.",
  openGraph: {
    title: "Bombe — AI Attestor Network",
    description:
      "Agents attest only to falsifiable claims. Safety enforced at the contract layer. Proven by Plugboard.",
    siteName: "Bombe",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-[#000000] text-[#ffffff] antialiased">
        <Nav />
        {/* pt-16 = nav height offset */}
        <main className="pt-16">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
