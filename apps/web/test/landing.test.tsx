import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LandingPage from "../app/page";

// Mock next/link, not available in jsdom
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// Mock the live stats fetch so tests do no network I/O. null exercises the
// fallback branch; the hero copy under test renders either way.
vi.mock("@/lib/public-api", () => ({
  getNetworkStats: vi.fn().mockResolvedValue(null),
}));

// Mock the Spline 3D runtime, WebGL is unavailable in jsdom.
vi.mock("@splinetool/react-spline", () => ({
  default: () => null,
}));

// Mock GSAP, no real layout/scroll engine in jsdom. Timelines are chainable
// no-ops; context runs its setup callback and exposes revert.
vi.mock("gsap", () => {
  const timeline: Record<string, () => unknown> = {};
  for (const method of ["to", "fromTo", "set", "add"]) {
    timeline[method] = () => timeline;
  }
  return {
    gsap: {
      registerPlugin: () => {},
      set: () => {},
      to: () => {},
      fromTo: () => {},
      timeline: () => timeline,
      context: (fn?: () => void) => {
        fn?.();
        return { revert: () => {} };
      },
    },
  };
});
vi.mock("gsap/ScrollTrigger", () => ({ ScrollTrigger: {} }));

// LandingPage is an async server component; resolve it before rendering.
async function renderPage() {
  render(await LandingPage());
}

describe("Landing page", () => {
  it("renders the hero headline", async () => {
    await renderPage();
    expect(screen.getByText(/AI attestors that/i)).toBeTruthy();
  });

  it("renders 'falsifiable claims' in the thesis copy", async () => {
    await renderPage();
    // Multiple elements may contain "falsifiable", verify at least one exists
    const els = screen.getAllByText(/falsifiable/i);
    expect(els.length).toBeGreaterThan(0);
  });

  it("renders the delta table section heading", async () => {
    await renderPage();
    expect(screen.getByText(/How Bombe is different/i)).toBeTruthy();
  });

  it("renders the claim taxonomy section heading", async () => {
    await renderPage();
    expect(screen.getByText(/Claim taxonomy/i)).toBeTruthy();
  });

  it("renders Tier 1 DETERMINISTIC explainer", async () => {
    await renderPage();
    // "DETERMINISTIC" appears in the tier-1 card heading ("Tier 1, DETERMINISTIC")
    const els = screen.getAllByText(/DETERMINISTIC/i);
    expect(els.length).toBeGreaterThan(0);
  });

  it("renders Tier 3 JUDGMENT explainer mentioning ABSTAIN", async () => {
    await renderPage();
    // "JUDGMENT" appears in the tier-3 card heading
    const judgmentEls = screen.getAllByText(/JUDGMENT/i);
    expect(judgmentEls.length).toBeGreaterThan(0);
    // ABSTAIN appears in the tier-3 card description
    const abstainElements = screen.getAllByText(/ABSTAIN/i);
    expect(abstainElements.length).toBeGreaterThan(0);
  });

  it("renders the Plugboard section", async () => {
    await renderPage();
    // "Plugboard" appears in multiple places (thesis copy + section heading)
    const els = screen.getAllByText(/Plugboard/i);
    expect(els.length).toBeGreaterThan(0);
  });

  it("renders CTAs with links to /live and /issuers", async () => {
    await renderPage();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/live");
    expect(hrefs).toContain("/issuers");
  });

  it("renders BLOCKED BY PROTOCOL badge text", async () => {
    await renderPage();
    // Used in the Plugboard section inline span
    const blockedElements = screen.getAllByText(/BLOCKED BY PROTOCOL/i);
    expect(blockedElements.length).toBeGreaterThan(0);
  });
});
