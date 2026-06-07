"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// DESIGN.md nav-bar: canvas-dark bg, height 64px, button-md labels
// Taste: backdrop-blur glassmorphism nav; smooth mobile dropdown with proper focus states

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/live", label: "Live" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/verify", label: "Verify" },
  { href: "/issuers", label: "Issuers" },
  { href: "/operator", label: "Operator" },
] as const;

export function Nav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center px-6 border-b border-[rgba(255,255,255,0.06)]"
      style={{
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(20px) saturate(1.4)",
        WebkitBackdropFilter: "blur(20px) saturate(1.4)",
      }}
      aria-label="Primary navigation"
    >
      {/* Wordmark */}
      <Link
        href="/"
        className="flex items-center gap-2 mr-auto group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf] rounded-sm"
        aria-label="Bombe home"
      >
        <span className="text-[20px] font-semibold text-[#ffffff] tracking-[-0.5px] group-hover:text-[rgba(255,255,255,0.9)] transition-colors">
          Bombe
        </span>
        <span
          className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full tracking-[0.3px]"
          style={{ backgroundColor: "rgba(73,79,223,0.18)", color: "#4f55f1" }}
        >
          TESTNET
        </span>
      </Link>

      {/* Desktop nav links, hidden below md */}
      <ul className="hidden md:flex items-center gap-0.5">
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                className={`px-3 py-2 text-[14px] font-semibold rounded-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf] ${
                  isActive
                    ? "bg-[#16181a] text-[#ffffff]"
                    : "text-[rgba(255,255,255,0.60)] hover:text-[#ffffff] hover:bg-[rgba(255,255,255,0.06)]"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Desktop CTA, button-primary (white pill on dark) */}
      <Link
        href="/live"
        className="hidden md:inline-flex items-center ml-4 px-5 py-2 text-[14px] font-semibold bg-[#ffffff] text-[#000000] rounded-full hover:bg-[#e8e8e8] active:scale-[0.97] transition-all duration-150 hover:shadow-[0_2px_12px_rgba(255,255,255,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf]"
      >
        Watch Live
      </Link>

      {/* Mobile hamburger */}
      <button
        type="button"
        className="md:hidden text-[rgba(255,255,255,0.72)] hover:text-[#ffffff] ml-4 p-2 rounded-md hover:bg-[rgba(255,255,255,0.06)] transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#494fdf]"
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
          className="absolute top-16 left-0 right-0 border-b border-[rgba(255,255,255,0.06)] py-3 px-4 flex flex-col gap-0.5 md:hidden"
          style={{
            background: "rgba(0,0,0,0.92)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="px-3 py-3 text-[16px] font-semibold text-[rgba(255,255,255,0.72)] hover:text-[#ffffff] rounded-xl hover:bg-[rgba(255,255,255,0.06)] transition-all duration-150"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/live"
            onClick={() => setMenuOpen(false)}
            className="mt-2 px-5 py-3 text-[16px] font-semibold bg-[#ffffff] text-[#000000] rounded-full text-center hover:bg-[#e8e8e8] transition-all duration-150"
          >
            Watch Live
          </Link>
        </div>
      )}
    </nav>
  );
}
