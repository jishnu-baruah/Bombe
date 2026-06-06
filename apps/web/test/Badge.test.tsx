import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "../components/ui/Badge";

// jsdom normalises inline hex colours to rgb(r, g, b) in computed style.
// We test via data-testid + text content + data-color attribute which Badge sets.
// For color checks we use the data-color attribute added to Badge.

describe("Badge", () => {
  it("renders VALID badge with label VALID", () => {
    render(<Badge variant="VALID" />);
    const badge = screen.getByTestId("badge-VALID");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe("VALID");
    // The color is set in inline style; jsdom converts rgb - check data-color attr
    expect(badge.getAttribute("data-color")).toBe("#428619");
  });

  it("renders REJECTED badge with label REJECTED", () => {
    render(<Badge variant="REJECTED" />);
    const badge = screen.getByTestId("badge-REJECTED");
    expect(badge.textContent).toBe("REJECTED");
    expect(badge.getAttribute("data-color")).toBe("#e23b4a");
  });

  it("renders ABSTAIN badge with label ABSTAIN", () => {
    render(<Badge variant="ABSTAIN" />);
    const badge = screen.getByTestId("badge-ABSTAIN");
    expect(badge.textContent).toBe("ABSTAIN");
    expect(badge.getAttribute("data-color")).toBe("#b09000");
  });

  it("renders BLOCKED_BY_PROTOCOL badge with purple color", () => {
    render(<Badge variant="BLOCKED_BY_PROTOCOL" />);
    const badge = screen.getByTestId("badge-BLOCKED_BY_PROTOCOL");
    expect(badge.textContent).toBe("BLOCKED BY PROTOCOL");
    expect(badge.getAttribute("data-color")).toBe("#7c3aed");
  });

  it("renders EXTERNAL_RUNTIME badge", () => {
    render(<Badge variant="EXTERNAL_RUNTIME" />);
    const badge = screen.getByTestId("badge-EXTERNAL_RUNTIME");
    expect(badge.textContent).toBe("EXTERNAL RUNTIME");
    expect(badge.getAttribute("data-color")).toBe("#8d969e");
  });

  it("renders tier-1 badge with cobalt-violet color", () => {
    render(<Badge variant="tier-1" />);
    const badge = screen.getByTestId("badge-tier-1");
    expect(badge.textContent).toBe("TIER 1");
    expect(badge.getAttribute("data-color")).toBe("#4f55f1");
  });

  it("renders custom label override", () => {
    render(<Badge variant="VALID" label="Confirmed" />);
    expect(screen.getByText("Confirmed")).toBeTruthy();
  });
});
