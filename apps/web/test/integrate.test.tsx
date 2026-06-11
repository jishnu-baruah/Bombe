import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import IntegratePage from "../app/(app)/integrate/page";

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

describe("Integrate page", () => {
  it("renders the four-steps headline", () => {
    render(<IntegratePage />);
    expect(screen.getByText(/Four steps/i)).toBeTruthy();
  });

  it("renders the read-path step titles", () => {
    render(<IntegratePage />);
    expect(screen.getByText(/Read the verdict/i)).toBeTruthy();
    expect(screen.getByText(/Verify the trace/i)).toBeTruthy();
  });

  it("is honest about posting: pay, the protocol key posts, funds not custodied", () => {
    render(<IntegratePage />);
    expect(screen.getByText(/the protocol key does the posting/i)).toBeTruthy();
    expect(screen.getByText(/never custodied/i)).toBeTruthy();
  });

  it("links to the issuers page and the live race", () => {
    render(<IntegratePage />);
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/issuers");
    expect(hrefs).toContain("/live");
  });

  it("does not leak internal task identifiers", () => {
    const { container } = render(<IntegratePage />);
    expect(container.textContent).not.toMatch(/\bT-\d|\bT-J\d|\bOP-\d/);
  });

  it("uses no em-dashes in copy", () => {
    const { container } = render(<IntegratePage />);
    expect(container.textContent).not.toContain("—");
  });
});
