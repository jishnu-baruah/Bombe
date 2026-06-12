import Link from "next/link";

// Landing footer with Bombe's real routes + external links.
const footerLinks: Record<
  string,
  { name: string; href: string; external?: boolean; badge?: string }[]
> = {
  Product: [
    { name: "Live Race", href: "/live" },
    { name: "Verify", href: "/verify" },
    { name: "Explorer", href: "/explorer" },
    { name: "Capabilities", href: "/#capabilities" },
    { name: "For issuers", href: "/issuers" },
  ],
  Developers: [
    {
      name: "Documentation",
      href: "https://jishnus-organization-1.gitbook.io/bombe/",
      external: true,
    },
    { name: "Integration guide", href: "/integrate" },
    { name: "API schema", href: "/api/v1/schema", external: true },
    { name: "Request attestation", href: "/request" },
  ],
  Protocol: [
    { name: "Operator console", href: "/operator" },
    { name: "Health", href: "/operator/health" },
    { name: "GitHub", href: "https://github.com/jishnu-baruah/Bombe", external: true },
  ],
  Network: [
    { name: "Mantle Sepolia", href: "https://sepolia.mantlescan.xyz", external: true },
    {
      name: "Mantle Turing Test",
      href: "https://dorahacks.io/hackathon/mantleturingtesthackathon2026",
      external: true,
    },
  ],
};

const socialLinks = [
  { name: "GitHub", href: "https://github.com/jishnu-baruah/Bombe" },
  { name: "Explorer", href: "https://sepolia.mantlescan.xyz" },
  { name: "DoraHacks", href: "https://dorahacks.io/hackathon/mantleturingtesthackathon2026" },
];

function ArrowUpRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "w-3 h-3"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </svg>
  );
}

export function FooterSection() {
  return (
    <footer className="relative bg-background">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
        {/* Main Footer */}
        <div className="py-16 lg:py-20">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-12 lg:gap-8">
            {/* Brand Column */}
            <div className="col-span-2">
              <Link href="/" className="inline-flex items-center gap-2 mb-6">
                <span className="font-display text-xl text-foreground">Bombe</span>
                <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground">
                  TESTNET
                </span>
              </Link>

              <p className="pretty text-sm text-muted-foreground leading-relaxed mb-8 max-w-[20rem]">
                AI attestors for RWA claims on Mantle. Falsifiable-only, enforced on-chain.
              </p>

              {/* Social Links */}
              <div className="flex gap-6">
                {socialLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-1 text-sm text-muted-foreground cursor-pointer transition-colors duration-150 hover:text-foreground"
                  >
                    {link.name}
                    <ArrowUpRightIcon className="w-3 h-3 opacity-0 -translate-x-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0" />
                  </a>
                ))}
              </div>
            </div>

            {/* Link Columns */}
            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title}>
                <h3 className="text-sm font-medium text-foreground mb-6">{title}</h3>
                <ul className="space-y-4">
                  {links.map((link) =>
                    link.external ? (
                      <li key={link.name}>
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer transition-colors duration-150 hover:text-foreground"
                        >
                          {link.name}
                          <ArrowUpRightIcon className="w-3 h-3 opacity-50" />
                        </a>
                      </li>
                    ) : (
                      <li key={link.name}>
                        <Link
                          href={link.href}
                          className="text-sm text-muted-foreground cursor-pointer transition-colors duration-150 hover:text-foreground"
                        >
                          {link.name}
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="py-8 border-t border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">Testnet only · no real economic value</p>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Live on Mantle Sepolia
            </span>
            <span className="font-mono text-xs tabular">Chain 5003</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
