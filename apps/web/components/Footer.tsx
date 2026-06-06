import Link from "next/link";

// DESIGN.md footer: canvas-dark bg, on-dark-mute text, body-sm type, padding 80px 24px.
// Multi-column quick-links grid + copyright/disclosure block separated by divider-soft.

export function Footer() {
  return (
    <footer className="bg-[#000000] text-[rgba(255,255,255,0.72)] border-t border-[rgba(255,255,255,0.06)] pt-20 pb-10 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Footer grid: 2-up mobile, 4-up desktop */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
          <div>
            <h3 className="text-[14px] font-semibold text-[#ffffff] mb-4 tracking-[0.24px]">
              Bombe
            </h3>
            <ul className="flex flex-col gap-2 text-[14px]">
              <li>
                <Link href="/" className="hover:text-[#ffffff] transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/live" className="hover:text-[#ffffff] transition-colors">
                  Live Race
                </Link>
              </li>
              <li>
                <Link href="/leaderboard" className="hover:text-[#ffffff] transition-colors">
                  Leaderboard
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-[14px] font-semibold text-[#ffffff] mb-4 tracking-[0.24px]">
              Protocol
            </h3>
            <ul className="flex flex-col gap-2 text-[14px]">
              <li>
                <Link href="/operator" className="hover:text-[#ffffff] transition-colors">
                  Operator Console
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/jishnu-baruah/Bombe"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#ffffff] transition-colors"
                >
                  GitHub ↗
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-[14px] font-semibold text-[#ffffff] mb-4 tracking-[0.24px]">
              Chain
            </h3>
            <ul className="flex flex-col gap-2 text-[14px]">
              <li>
                <a
                  href="https://sepolia.mantlescan.xyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#ffffff] transition-colors"
                >
                  Mantle Sepolia ↗
                </a>
              </li>
              <li>
                <span className="font-mono text-[12px] text-[#505a63]">Chain 5003</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-[14px] font-semibold text-[#ffffff] mb-4 tracking-[0.24px]">
              Hackathon
            </h3>
            <ul className="flex flex-col gap-2 text-[14px]">
              <li>
                <a
                  href="https://dorahacks.io/hackathon/mantleturingtesthackathon2026"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#ffffff] transition-colors"
                >
                  Mantle Turing Test ↗
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider + copyright */}
        <div className="border-t border-[rgba(255,255,255,0.06)] pt-8 flex flex-col md:flex-row justify-between gap-4 text-[13px] text-[#5c5e60]">
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
