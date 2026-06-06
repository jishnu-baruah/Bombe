"use client";

import { useState } from "react";

interface MonoProps {
  value: string;
  /** If true, truncates the middle of the value to truncateChars on each side. */
  truncate?: boolean;
  truncateChars?: number;
  showCopy?: boolean;
  className?: string;
}

function truncateMiddle(value: string, chars: number): string {
  if (value.length <= chars * 2 + 3) return value;
  return `${value.slice(0, chars)}…${value.slice(-chars)}`;
}

/**
 * Mono, monospace hash / address display with optional truncation + copy.
 * Used for reasoning hashes, tx hashes, agent addresses throughout the UI.
 * PRD §6.6: "monospace for hashes/addresses"
 */
export function Mono({
  value,
  truncate = false,
  truncateChars = 6,
  showCopy = true,
  className = "",
}: MonoProps) {
  const [copied, setCopied] = useState(false);

  const display = truncate ? truncateMiddle(value, truncateChars) : value;

  function handleCopy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <code
        className="font-mono text-[13px] text-[#8d969e] bg-[#16181a] px-2 py-0.5 rounded-[8px] break-all"
        title={value}
      >
        {display}
      </code>
      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          className="text-[#505a63] hover:text-[#ffffff] transition-colors cursor-pointer text-[11px] flex-shrink-0"
          aria-label="Copy to clipboard"
        >
          {copied ? "✓" : "⧉"}
        </button>
      )}
    </span>
  );
}
