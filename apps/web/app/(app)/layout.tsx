import { Nav } from "@/components/Nav";
import { FooterSection } from "@/components/landing/footer-section";

// All pages (landing + app) share one chrome: the floating glass pill Nav and the
// Mouli FooterSection, so the navbar and footer are identical everywhere. app-enter
// gives each inner page a one-time fade-up on load.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      {/* pt-28 clears the floating pill (top 24px + 56px height) */}
      <main className="pt-28 app-enter">{children}</main>
      <FooterSection />
    </>
  );
}
