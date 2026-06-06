import Link from "next/link";

// DESIGN.md footer: canvas-dark bg, on-dark-mute text, body-sm type, padding 80px 24px.
// Taste: stronger column hierarchy, better hover states, chain ID in mono

export function Footer() {
  return (
    <footer
      className="border-t border-[rgba(255,255,255,0.06)] pt-16 pb-10 px-6"
      style={{ background: "#000000" }}
    >
      <div className="max-w-6xl mx-auto">
        {/* Wordmark row */}
        <div className="mb-10 pb-8 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-semibold text-[#ffffff] tracking-[-0.3px]">
              Bombe
            </span>
            <span
              className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full"
              style={{ backgroundColor: "rgba(73,79,223,0.18)", color: "#4f55f1" }}
            >
              TESTNET
            </span>
          </div>
          <p className="text-[13px] text-[#3a3d40] font-mono">Mantle Sepolia · Chain 5003</p>
        </div>

        {/* Footer grid: 2-up mobile, 4-up desktop */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div>
            <h3 className="text-[12px] font-semibold text-[rgba(255,255,255,0.50)] mb-4 tracking-[0.8px] uppercase">
              Bombe
            </h3>
            <ul className="flex flex-col gap-2.5 text-[14px]">
              <li>
                <Link
                  href="/"
                  className="text-[rgba(255,255,255,0.50)] hover:text-[#ffffff] transition-colors duration-150"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/live"
                  className="text-[rgba(255,255,255,0.50)] hover:text-[#ffffff] transition-colors duration-150"
                >
                  Live Race
                </Link>
              </li>
              <li>
                <Link
                  href="/leaderboard"
                  className="text-[rgba(255,255,255,0.50)] hover:text-[#ffffff] transition-colors duration-150"
                >
                  Leaderboard
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-[12px] font-semibold text-[rgba(255,255,255,0.50)] mb-4 tracking-[0.8px] uppercase">
              Protocol
            </h3>
            <ul className="flex flex-col gap-2.5 text-[14px]">
              <li>
                <Link
                  href="/operator"
                  className="text-[rgba(255,255,255,0.50)] hover:text-[#ffffff] transition-colors duration-150"
                >
                  Operator Console
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/jishnu-baruah/Bombe"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[rgba(255,255,255,0.50)] hover:text-[#ffffff] transition-colors duration-150"
                >
                  GitHub ↗
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-[12px] font-semibold text-[rgba(255,255,255,0.50)] mb-4 tracking-[0.8px] uppercase">
              Chain
            </h3>
            <ul className="flex flex-col gap-2.5 text-[14px]">
              <li>
                <a
                  href="https://sepolia.mantlescan.xyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[rgba(255,255,255,0.50)] hover:text-[#ffffff] transition-colors duration-150"
                >
                  Mantle Sepolia ↗
                </a>
              </li>
              <li>
                <span className="font-mono text-[12px] text-[#3a3d40] tabular">Chain 5003</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-[12px] font-semibold text-[rgba(255,255,255,0.50)] mb-4 tracking-[0.8px] uppercase">
              Hackathon
            </h3>
            <ul className="flex flex-col gap-2.5 text-[14px]">
              <li>
                <a
                  href="https://dorahacks.io/hackathon/mantleturingtesthackathon2026"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[rgba(255,255,255,0.50)] hover:text-[#ffffff] transition-colors duration-150"
                >
                  Mantle Turing Test ↗
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider + copyright */}
        <div className="border-t border-[rgba(255,255,255,0.05)] pt-8 flex flex-col md:flex-row justify-between gap-3 text-[13px] text-[#3a3d40]">
          <p>
            Bombe — AI Attestor Network for RWA claims on Mantle. Testnet only. No real economic
            value.
          </p>
          <p className="md:text-right">Mantle Turing Test Hackathon 2026</p>
        </div>
      </div>
    </footer>
  );
}
