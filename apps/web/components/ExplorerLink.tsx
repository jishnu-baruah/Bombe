import type { ReactNode } from "react";

// Explorer link helper (PRD §6.6):
//   mock mode → address/tx rendered as monospace with "mock chain" tooltip,
//               link disabled.
//   live mode → links to Mantle Sepolia explorer (chain 5003).
//
// Mode is read from NEXT_PUBLIC_APP_MODE (build-time env var).
// Default is "mock" so the app is safe without any env config.

const MANTLE_SEPOLIA_EXPLORER = "https://sepolia.mantlescan.xyz";

interface ExplorerLinkProps {
  type: "address" | "tx";
  value: string;
  children?: ReactNode;
  className?: string;
}

function truncate(value: string, chars = 6): string {
  if (value.length <= chars * 2 + 3) return value;
  return `${value.slice(0, chars)}…${value.slice(-chars)}`;
}

export function ExplorerLink({ type, value, children, className = "" }: ExplorerLinkProps) {
  // NEXT_PUBLIC_ vars are inlined at build time by Next.js
  const isMock = (process.env.NEXT_PUBLIC_APP_MODE ?? "mock") === "mock";

  const display = children ?? (
    <code className="font-mono text-[13px] text-[#8d969e]">{truncate(value)}</code>
  );

  if (isMock) {
    return (
      <span
        className={`inline-flex items-center gap-1 cursor-default ${className}`}
        title="Links disabled in mock mode, no live chain"
        aria-label={`${type} ${value} (mock chain, link disabled)`}
      >
        {display}
        <span className="text-[11px] text-[#505a63] border border-[#505a63] rounded px-1">
          mock
        </span>
      </span>
    );
  }

  const href =
    type === "address"
      ? `${MANTLE_SEPOLIA_EXPLORER}/address/${value}`
      : `${MANTLE_SEPOLIA_EXPLORER}/tx/${value}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-[#376cd5] hover:underline ${className}`}
    >
      {display}
      <span className="text-[11px]" aria-hidden="true">
        ↗
      </span>
    </a>
  );
}
