"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// DESIGN.md nav-bar: canvas-dark bg, height 64px, button-md labels
// Responsive: collapses to hamburger at < md (768px); logo + CTA stay anchored.

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/live", label: "Live" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/operator", label: "Operator" },
] as const;

export function Nav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 h-16 bg-[#000000] border-b border-[rgba(255,255,255,0.06)] flex items-center px-6"
      aria-label="Primary navigation"
    >
      {/* Wordmark */}
      <Link href="/" className="flex items-center gap-2 mr-auto" aria-label="Bombe home">
        <span className="text-[20px] font-semibold text-[#ffffff] tracking-tight">Bombe</span>
        <span
          className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full"
          style={{ backgroundColor: "rgba(73,79,223,0.18)", color: "#4f55f1" }}
        >
          TESTNET
        </span>
      </Link>

      {/* Desktop nav links — hidden below md */}
      <ul className="hidden md:flex items-center gap-1">
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                className={`px-3 py-2 text-[14px] font-semibold rounded-full transition-colors ${
                  isActive
                    ? "bg-[#16181a] text-[#ffffff]"
                    : "text-[rgba(255,255,255,0.72)] hover:text-[#ffffff] hover:bg-[#16181a]"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Desktop CTA — button-primary (white pill on dark) */}
      <Link
        href="/live"
        className="hidden md:inline-flex items-center ml-6 px-5 py-2 text-[14px] font-semibold bg-[#ffffff] text-[#000000] rounded-full hover:bg-[#c9c9cd] transition-colors"
      >
        Watch Live
      </Link>

      {/* Mobile hamburger */}
      <button
        type="button"
        className="md:hidden text-[#ffffff] ml-4 p-2 rounded-md hover:bg-[#16181a] transition-colors"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        aria-controls="mobile-menu"
      >
        <span className="text-[18px]">{menuOpen ? "✕" : "☰"}</span>
      </button>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div
          id="mobile-menu"
          className="absolute top-16 left-0 right-0 bg-[#000000] border-b border-[rgba(255,255,255,0.06)] py-4 px-6 flex flex-col gap-1 md:hidden"
        >
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="px-3 py-3 text-[16px] font-semibold text-[rgba(255,255,255,0.72)] hover:text-[#ffffff] rounded-md hover:bg-[#16181a] transition-colors"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/live"
            onClick={() => setMenuOpen(false)}
            className="mt-2 px-5 py-3 text-[16px] font-semibold bg-[#ffffff] text-[#000000] rounded-full text-center hover:bg-[#c9c9cd] transition-colors"
          >
            Watch Live
          </Link>
        </div>
      )}
    </nav>
  );
}
