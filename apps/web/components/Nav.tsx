"use client";

import { useHideOnScroll } from "@/lib/use-hide-on-scroll";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// Floating glass pill nav, unified with the landing chrome: centered,
// backdrop-blur, hairline stroke, white pill CTA. Active route highlighted.

// One nav for the whole site (landing + app). Links point at the functional /
// capability surfaces that get demoed and checked. Operator is internal ops and
// lives in the footer, not the primary nav.
const NAV_LINKS = [
  { href: "/live", label: "Live" },
  { href: "/verify", label: "Verify" },
  { href: "/issuers", label: "Issuers" },
  { href: "/integrate", label: "Integrate" },
] as const;

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {open ? (
        <>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // Hide the pill on scroll-down, reveal on scroll-up. Force-visible whenever the
  // mobile menu is open so it can never scroll away mid-interaction.
  const hidden = useHideOnScroll() && !menuOpen;

  return (
    <header
      className={`fixed top-[24px] left-0 right-0 z-50 flex justify-center px-4 transition-transform duration-300 ease-out will-change-transform ${
        hidden ? "-translate-y-[160%]" : "translate-y-0"
      }`}
    >
      <nav
        className="w-fit max-w-full backdrop-blur-[20px] bg-white/[0.06] rounded-full border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
        aria-label="Primary navigation"
      >
        <div className="flex items-center gap-4 lg:gap-6 h-14 pl-6 pr-2.5">
          {/* Wordmark */}
          <Link
            href="/"
            className="flex items-center gap-2 group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf] rounded-sm"
            aria-label="Bombe home"
          >
            <span className="font-display text-lg text-foreground">Bombe</span>
            <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground mt-0.5">
              TESTNET
            </span>
          </Link>

          {/* Desktop nav links */}
          <ul className="hidden lg:flex items-center gap-0.5">
            {NAV_LINKS.map(({ href, label }) => {
              const isActive = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={`px-3 py-2 text-sm rounded-full cursor-pointer transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf] ${
                      isActive
                        ? "bg-white/[0.10] text-white"
                        : "text-white/65 hover:text-white hover:bg-white/[0.06]"
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Desktop CTA */}
          <Link
            href="/live"
            className="hidden lg:inline-flex items-center h-9 px-5 rounded-full bg-white text-black text-sm font-medium cursor-pointer transition-all duration-150 hover:bg-white/90 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf]"
          >
            Watch live
          </Link>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="lg:hidden flex items-center justify-center w-11 h-11 -ml-1 rounded-full text-white cursor-pointer transition-colors duration-150 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf]"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            <MenuIcon open={menuOpen} />
          </button>
        </div>
      </nav>

      {/* Mobile dropdown: glass panel below the pill */}
      {menuOpen && (
        <div
          id="mobile-menu"
          className="absolute top-[72px] left-4 right-4 lg:hidden rounded-[20px] border border-white/10 backdrop-blur-[20px] bg-black/85 shadow-[0_16px_60px_rgba(0,0,0,0.6)] py-3 px-3 flex flex-col gap-0.5"
        >
          <Link
            href="/"
            onClick={() => setMenuOpen(false)}
            className="px-4 py-3 text-base text-white/70 hover:text-white rounded-[12px] hover:bg-white/[0.06] cursor-pointer transition-colors duration-150"
          >
            Home
          </Link>
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="px-4 py-3 text-base text-white/70 hover:text-white rounded-[12px] hover:bg-white/[0.06] cursor-pointer transition-colors duration-150"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/live"
            onClick={() => setMenuOpen(false)}
            className="mt-2 h-12 inline-flex items-center justify-center text-base font-medium bg-white text-black rounded-full cursor-pointer transition-all duration-150 hover:bg-white/90 active:scale-[0.98]"
          >
            Watch live
          </Link>
        </div>
      )}
    </header>
  );
}
