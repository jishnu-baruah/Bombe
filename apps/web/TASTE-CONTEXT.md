# TASTE-CONTEXT — Bombe Web UI Design Context

## One-line design read

Redesign-preserve of an AI-attestor product — landing + live product surfaces — Revolut-style
premium-fintech, restrained motion. Dark canvas system. Cobalt-violet as a single deliberate stamp.

---

## Design dials

| Dial | Value | Notes |
|------|-------|-------|
| DESIGN_VARIANCE | 7 | Strong Revolut-DNA with selective departures (asymmetric landing, ambient glow, glassmorphism nav) |
| MOTION_INTENSITY | 5 | Tasteful hover/active/focus states; no infinite-loop micro-animations; CSS transitions only |
| VISUAL_DENSITY | 4 (landing ~3, data surfaces ~5) | Landing breathes; /live and /leaderboard are dense data surfaces |

---

## Base design system (DESIGN.md)

- **Canvas:** `#000000` dark storytelling canvas + `#0a0a0a` section alternation + `#16181a` surface-elevated cards.
- **Accent:** `#494fdf` cobalt-violet. Reserved for `plan-card-featured` stamp and eyebrow labels — never full page-width bands.
- **Typography:** `Inter` (body, 400/600) — tabular-nums for data cells, tight negative letter-spacing on display sizes (`clamp` from mobile to desktop). `text-wrap: balance` on headlines, `pretty` on prose.
- **Buttons:** pill-shaped (`rounded-full`), 48px height, `scale-[0.98]` on active, `shadow` on hover for primary.
- **Cards:** `rounded-[20px]`, tinted box-shadow for depth, hover-lift transitions.
- **Radius:** none (full-bleed) → sm (8px, chips) → md (12px, inputs) → lg (20px, cards) → full (buttons/pills).

---

## Anti-slop rules (taste-skill enforcement)

1. **No symmetric 3-equal-card grids on the landing.** Use asymmetric layouts: 1-wide featured + 2-stack, or 2-col with varied proportions.
2. **No pure #000000 body bg + pure white text with zero depth.** Add ambient radial gradient (`rgba(73,79,223,0.11)`) behind hero. Off-black `#0a0a0a` for alternating bands.
3. **No flat nav bar.** Use `backdrop-blur(20px)` glassmorphism. Border-b at 6% white opacity.
4. **No missing interactive states.** Every Button/Card/Link must have hover, active, and focus-visible treatments.
5. **No Inter-only display.** Heavy negative tracking on display headlines to compensate for Aeonik Pro absence. `clamp()` sizing for responsive flow.
6. **No cobalt-violet full-page-width hero band.** The brand stamp stays on `plan-card-featured` (a single card), not a `section` background.
7. **No centered-symmetric landing hero.** Asymmetric grid: headline prose left, stat cluster right on `lg+`.
8. **Tabular numerals on all data cells.** `font-variant-numeric: tabular-nums` via `.tabular` utility class.
9. **text-wrap: balance on all h1/h2; text-wrap: pretty on prose.** Prevents orphans and ragged last lines.
10. **No pure #000 button border on outline-dark.** Use `rgba(255,255,255,0.40)` → `0.72` on hover for a refined, non-harsh outline.

---

## Surface hierarchy (dark mode only for Bombe)

| Level | Color | Use |
|-------|-------|-----|
| 0 — canvas | `#000000` | Hero, full-bleed bands, footer |
| 1 — section | `#0a0a0a` | Alternating content bands |
| 2 — card | `#16181a` | Feature cards, claim cards |
| 3 — deep | `#0a0a0a` inside card | Code/chip insets within cards |
| accent — stamp | `#494fdf` | plan-card-featured, eyebrow labels only |

---

## What NOT to change on data surfaces (/live, /leaderboard, /operator)

- Do NOT reduce table column count or remove sortable headers.
- Do NOT remove agent columns from the race grid.
- Do NOT change decision chip colors (they are semantic: VALID=green, REJECTED=red, ABSTAIN=amber, BLOCKED=purple).
- Do NOT remove the guided-demo flow or toast system.
- Font sizes on data tables stay at 13-14px (density is correct for fintech data).
- Apply only: eyebrow label style, h1 tracking/balance, tabular-nums on numeric cells, Card/Button polish.

---

## Motion spec (MOTION_INTENSITY 5)

- Button hover: `transition-all duration-150` + `shadow` lift + `bg` shift. Active: `scale-[0.98]`.
- Card hover: `border-opacity` increase + `shadow` lift. `transition-all duration-200`.
- Nav link hover: `bg` tint `rgba(255,255,255,0.06)`, `color` to `#ffffff`. `duration-150`.
- No CSS `@keyframes` on data surfaces (except existing `animate-pulse` for live status dots, which is correct).
- No scroll-triggered animations (performance + SSR safety).
- Hero ambient gradient is static (CSS `::before` pseudo-element), not animated.
