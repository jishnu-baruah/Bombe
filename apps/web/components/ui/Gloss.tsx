import type { ReactNode } from "react";

/**
 * Inline jargon gloss. Renders a dotted-underline term with a native tooltip
 * (semantic <abbr>, works without JS and is screen-reader friendly). Per the
 * content DNA, essential meaning is still defined inline on first use; this is
 * the supplementary hover for repeats and for the data surfaces.
 */
export function Gloss({ children, def }: { children: ReactNode; def: string }) {
  return (
    <abbr
      title={def}
      className="no-underline border-b border-dotted border-[rgba(255,255,255,0.35)] cursor-help decoration-clone"
    >
      {children}
    </abbr>
  );
}

/**
 * Plain-language glosses for Bombe's jargon (source of truth: docs/CONTENT-DNA.md).
 * One line each, jargon-free, the "so what" spelled out.
 */
export const GLOSSARY = {
  attestation:
    "A signed, on-chain statement that says we checked this claim and here is the result, which anyone can look up.",
  falsifiable:
    "A claim you could prove wrong with data (a yield number), not an opinion. It is the only kind Bombe will judge.",
  abstain:
    "When the evidence is not clear enough, the network declines to rule rather than guess. Refusing to answer is a safety feature.",
  reasoningHash:
    "A fingerprint of the agent's reasoning, stored on-chain, so anyone can prove the logic was not changed after the fact.",
  sourcesHash: "A fingerprint of the exact data sources the verdict was computed from.",
  reconcile:
    "Cross-checking the same fact from more than one computation path and confirming they agree within an allowed margin, or else abstaining.",
  consensusOverEvidence:
    "Agents agree on the measured values, not on opinions, so no single model can swing a verdict.",
  trustScore: "A 0 to 100 accuracy score from an attestor's past settled verdicts.",
  bond: "Stake an attestor locks up; it is slashed if the attestation is proven wrong.",
  confidenceBps: "How sure the attestor is, in basis points (10000 = fully confident).",
  tier1: "Deterministic claims provable from on-chain state or oracle math.",
  tier2: "Claims provable by cross-checking referenced documents.",
  tier3:
    "Judgment or valuation claims; attestation is forbidden, the only valid answer is abstain.",
} as const;
