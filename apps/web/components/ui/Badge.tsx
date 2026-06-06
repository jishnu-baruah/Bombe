// Badge component, tier badges, AI/human labels, decision chips.
// Decision chip colors are semantic, not brand accents:
//   VALID        → green  (#428619)
//   REJECTED     → red    (#e23b4a)
//   ABSTAIN      → amber  (#b09000)
//   BLOCKED_BY_PROTOCOL → purple (#7c3aed) , Plugboard contract revert
//   EXTERNAL_RUNTIME    → stone  (#8d969e) , Plugboard badge in race view

export type DecisionVariant =
  | "VALID"
  | "REJECTED"
  | "ABSTAIN"
  | "BLOCKED_BY_PROTOCOL"
  | "EXTERNAL_RUNTIME";

export type TierVariant = "tier-1" | "tier-2" | "tier-3";
export type AgentTypeVariant = "AI" | "HUMAN";
export type BadgeVariant = DecisionVariant | TierVariant | AgentTypeVariant;

interface BadgeProps {
  variant: BadgeVariant;
  label?: string;
  className?: string;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string; label: string }> = {
  VALID: { bg: "rgba(66,134,25,0.12)", text: "#428619", label: "VALID" },
  REJECTED: { bg: "rgba(226,59,74,0.12)", text: "#e23b4a", label: "REJECTED" },
  ABSTAIN: { bg: "rgba(176,144,0,0.12)", text: "#b09000", label: "ABSTAIN" },
  BLOCKED_BY_PROTOCOL: {
    bg: "rgba(124,58,237,0.12)",
    text: "#7c3aed",
    label: "BLOCKED BY PROTOCOL",
  },
  EXTERNAL_RUNTIME: {
    bg: "rgba(141,150,158,0.15)",
    text: "#8d969e",
    label: "EXTERNAL RUNTIME",
  },
  "tier-1": { bg: "rgba(73,79,223,0.12)", text: "#4f55f1", label: "TIER 1" },
  "tier-2": { bg: "rgba(0,168,126,0.12)", text: "#00a87e", label: "TIER 2" },
  "tier-3": { bg: "rgba(176,144,0,0.12)", text: "#b09000", label: "TIER 3" },
  AI: { bg: "rgba(73,79,223,0.12)", text: "#4f55f1", label: "AI" },
  HUMAN: { bg: "rgba(0,168,126,0.12)", text: "#00a87e", label: "HUMAN" },
};

export function Badge({ variant, label, className = "" }: BadgeProps) {
  const style = variantStyles[variant];
  const displayLabel = label ?? style.label;

  return (
    <span
      className={`inline-flex items-center px-3 py-1 text-[13px] font-semibold leading-[1.4] rounded-full ${className}`}
      style={{ backgroundColor: style.bg, color: style.text }}
      data-testid={`badge-${variant}`}
      data-color={style.text}
    >
      {displayLabel}
    </span>
  );
}
