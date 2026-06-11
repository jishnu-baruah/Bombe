import { CapabilitiesSection } from "@/components/landing/capabilities-section";
import { CtaSection } from "@/components/landing/cta-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { FooterSection } from "@/components/landing/footer-section";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { Navigation } from "@/components/landing/navigation";
import { PlugboardSection } from "@/components/landing/plugboard-section";
import { TiersSection } from "@/components/landing/tiers-section";
import { CAPABILITY_REGISTRY } from "@bombe/agent-sdk";

// Capabilities, sorted live-first; serialized straight from the SDK registry
// (single source of truth with /api/v1/schema) so the landing cannot over-claim.
const CAPS = [...CAPABILITY_REGISTRY]
  .sort((a, b) => Number(b.status === "live") - Number(a.status === "live"))
  .map((c) => ({ claimType: c.claimType, tier: c.tier, status: c.status }));

export default function LandingPage() {
  return (
    <main className="landing relative min-h-screen overflow-x-hidden noise-overlay">
      <Navigation />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <TiersSection />
      <CapabilitiesSection caps={CAPS} />
      <PlugboardSection />
      <CtaSection />
      <FooterSection />
    </main>
  );
}
