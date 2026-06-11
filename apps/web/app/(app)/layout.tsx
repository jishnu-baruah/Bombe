import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";

// All inner pages share the dark app shell: floating glass pill Nav (same
// chrome as the landing) + Footer. app-enter gives each page a one-time
// fade-up on load (no scroll-triggered animation on data surfaces).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      {/* pt-28 clears the floating pill (top 24px + 56px height) */}
      <main className="pt-28 app-enter">{children}</main>
      <Footer />
    </>
  );
}
