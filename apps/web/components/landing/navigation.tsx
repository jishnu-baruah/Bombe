"use client";

import { useHideOnScroll } from "@/lib/use-hide-on-scroll";
import Link from "next/link";
import { useState } from "react";

// Glassmorphism nav (anti-slop rule 3): floating pill, backdrop-blur,
// hairline stroke. CTA follows the white-pill primary button system.
// `route: true` links are real app pages (Next <Link>); the rest scroll to a
// section on the landing page (<a href="#...">).
const navLinks = [
  { name: "Why Bombe", href: "#features" },
  { name: "How it works", href: "#how-it-works" },
  { name: "Claim types", href: "#capabilities" },
  { name: "Verify", href: "/verify", route: true },
];

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

export function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Hide on scroll-down, reveal on scroll-up; force-visible while the menu is open.
  const hidden = useHideOnScroll() && !isMobileMenuOpen;

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
        <div className="flex items-center gap-6 lg:gap-10 h-14 pl-6 pr-2.5">
          {/* Wordmark */}
          <Link href="/" className="flex items-center gap-2 group" aria-label="Bombe home">
            <span className="font-display text-lg text-foreground">Bombe</span>
            <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground mt-0.5">
              TESTNET
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const cls =
                "px-3 py-2 rounded-full text-sm text-foreground/70 cursor-pointer transition-colors duration-150 hover:text-foreground hover:bg-white/[0.06]";
              return link.route ? (
                <Link key={link.name} href={link.href} className={cls}>
                  {link.name}
                </Link>
              ) : (
                <a key={link.name} href={link.href} className={cls}>
                  {link.name}
                </a>
              );
            })}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-2">
            <Link
              href="/issuers"
              className="px-3 py-2 rounded-full text-sm text-foreground/70 cursor-pointer transition-colors duration-150 hover:text-foreground hover:bg-white/[0.06]"
            >
              For issuers
            </Link>
            <Link
              href="/live"
              className="inline-flex items-center h-9 px-5 rounded-full bg-white text-black text-sm font-medium cursor-pointer transition-all duration-150 hover:bg-white/90 active:scale-[0.98]"
            >
              Watch live
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden flex items-center justify-center w-11 h-11 -ml-2 rounded-full text-foreground cursor-pointer transition-colors duration-150 hover:bg-white/[0.06]"
            aria-label="Toggle menu"
            aria-expanded={isMobileMenuOpen}
          >
            <MenuIcon open={isMobileMenuOpen} />
          </button>
        </div>
      </nav>

      {/* Mobile Menu - Full Screen Overlay */}
      <div
        className={`md:hidden fixed inset-0 bg-background z-[-1] transition-all duration-300 ${
          isMobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex flex-col h-full px-8 pt-32 pb-8">
          {/* Navigation Links */}
          <div className="flex-1 flex flex-col justify-center gap-8">
            {navLinks.map((link, i) => {
              const cls = `font-display text-4xl text-foreground cursor-pointer transition-all duration-300 hover:text-muted-foreground ${
                isMobileMenuOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`;
              const style = { transitionDelay: isMobileMenuOpen ? `${i * 60}ms` : "0ms" };
              return link.route ? (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cls}
                  style={style}
                >
                  {link.name}
                </Link>
              ) : (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cls}
                  style={style}
                >
                  {link.name}
                </a>
              );
            })}
          </div>

          {/* Bottom CTAs */}
          <div
            className={`flex gap-4 pt-8 border-t border-white/[0.08] transition-all duration-300 ${
              isMobileMenuOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ transitionDelay: isMobileMenuOpen ? "240ms" : "0ms" }}
          >
            <Link
              href="/issuers"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex-1 inline-flex items-center justify-center h-12 rounded-full border border-white/40 text-base text-foreground cursor-pointer transition-colors duration-150 hover:border-white/70"
            >
              For issuers
            </Link>
            <Link
              href="/live"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex-1 inline-flex items-center justify-center h-12 rounded-full bg-white text-black text-base font-medium cursor-pointer transition-all duration-150 hover:bg-white/90 active:scale-[0.98]"
            >
              Watch live
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
