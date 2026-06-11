import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import IssuersPage from "../app/(app)/issuers/page";

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

describe("Issuers page", () => {
  it("renders the verify-it-on-chain headline", () => {
    render(<IssuersPage />);
    expect(screen.getByText(/verify it on-chain/i)).toBeTruthy();
  });

  it("shows the claim fee and attestor stake amounts", () => {
    render(<IssuersPage />);
    expect(screen.getAllByText(/0\.01 MNT/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0\.02 MNT/i).length).toBeGreaterThan(0);
  });

  it("states the falsifiable-only / abstain-only stance", () => {
    render(<IssuersPage />);
    expect(screen.getByText(/can&apos;t falsify|can't falsify/i)).toBeTruthy();
    expect(screen.getAllByText(/abstain/i).length).toBeGreaterThan(0);
  });

  it("links to the integrate and leaderboard pages", () => {
    render(<IssuersPage />);
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/integrate");
    expect(hrefs).toContain("/leaderboard");
  });

  it("does not leak internal task identifiers", () => {
    const { container } = render(<IssuersPage />);
    expect(container.textContent).not.toMatch(/\bT-\d|\bT-J\d|\bOP-\d/);
  });

  it("uses no em-dashes in copy", () => {
    const { container } = render(<IssuersPage />);
    expect(container.textContent).not.toContain("—");
  });
});
