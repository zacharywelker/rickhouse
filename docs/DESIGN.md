# Design brief

Captured from the references supplied, so the eventual redesign starts from
numbers rather than adjectives. **Nothing here is scheduled** — the theme is a
later decision, and this is the input to it.

The current dark wood-and-fireplace look is a placeholder. It is not the
direction.

---

## What "Liquid Glass" means here

Apple's design language, specifically — not "frosted panels" generically. The
parts that matter for a web app:

- **Layered translucent material.** Chrome floats above content and takes its
  tint from whatever is behind it, rather than being a fixed grey.
- **Depth by layering, not drop shadows.** Elevation reads through blur,
  tint and specular edge highlights.
- **Concentric radii.** A control inside a container uses a smaller radius
  derived from its parent's, so curves stay parallel rather than fighting.
- **Motion as continuity.** Things grow from where you touched them and return
  there; they do not cut.

In CSS that is `backdrop-filter: blur() saturate()`, a translucent background
tint, a hairline top-edge highlight, and transform-based transitions.

### The bit most people get wrong

Translucency and contrast pull against each other: text over a blurred backdrop
has a ratio that changes with whatever scrolls behind it. It can pass on one
screen and fail on the next.

Apple's own answer is that Liquid Glass is **adaptive, and defeatable** — it
ships behind Reduce Transparency and Increase Contrast. The web has the same
switches, and honouring them is what makes glass shippable rather than a
compromise:

```css
@media (prefers-reduced-transparency: reduce) { /* solid surfaces */ }
@media (prefers-contrast: more)               { /* opaque, stronger borders */ }
@media (prefers-reduced-motion: reduce)       { /* no springs, no parallax */ }
```

**The working rule:** glass for *chrome* — bars, sheets, sidebars, card edges.
Text sits on a solid or near-solid layer within it, never directly over blur.
That keeps the aesthetic and makes contrast a fixed, testable number.

---

## The three references, decoded

### Kinetic Flux — the closest to Liquid Glass

This is the structural system. A light canvas with white surfaces floating on
it, soft gradient washes bleeding in at the corners, pill-shaped controls, and
depth that reads as layering.

| Token | Value |
|---|---|
| Canvas | `#F4F6FB` |
| Surface | `#FFFFFF` |
| Accents | `#7DFF5A` chartreuse · `#2BB3FF` cyan · `#FF8A2B` orange · `#FF3B5C` red |
| Motion | Fast 180ms · Base 420ms · Slow 900ms |
| Easing | `ease-fluid` for travel, `ease-snap` for arrivals |

Its motion doctrine is the genuinely useful part, and it is unusually
well-specified: **velocity signals hierarchy.** Large elements accelerate
slowly; micro-actions snap. Reveals stagger in 120ms increments. Overshoot is
reserved for critical actions, so it means something when it happens.

### Tropical — the personality

This is where "fun, not a boring fireplace" comes from. Warm, saturated,
generous radii, bouncy.

| Token | Value |
|---|---|
| Fonts | Poppins (headings, 600–800) + Quicksand (body, 500) |
| Radius | 8 / 14 / 22 / 36 |
| Spacing | 4 / 8 / 16 / 32 / 64 / 128 |
| Motion | Bounce ease, 350ms |
| Greens | `#1a6b3c` `#2d8a4e` `#3ba55d` `#8fd4a4` |
| Warms | `#ff6b6b` coral · `#ff3e9d` hibiscus · `#ff8c42` sunset · `#ffe4a0` sand |
| Blues | `#00b4d8` lagoon · `#0077b6` ocean · `#90e0ef` seafoam |

Worth noting the warm half of this palette is already whiskey-adjacent —
sunset `#ff8c42` and golden sand `#ffe4a0` are amber and straw. The collection
brings its own colour, and it happens to sit inside this range.

### Suprematism — the odd one out

Flat, absolute, hard-edged, anti-gradient. It is the **direct opposite** of
Liquid Glass and cannot be applied as a skin alongside it.

| Token | Value |
|---|---|
| Palette | `#000000` `#D62828` `#003F88` `#F2C12E` `#FFFFFF` — no gradients, no shading |
| Font | Montserrat, hierarchy by weight and size alone |
| Forms | Sharp rectangles, diagonal thrust, asymmetric composition in white space |

What it *can* contribute is compositional nerve: bold geometric blocks, a
severe type hierarchy, confident asymmetry, and the discipline of a strict 4px
scale. Good for empty states, the dashboard, and section dividers — places
where a flat graphic element adds punch without fighting the glass.

---

## Recommended synthesis

Not three themes. One system, with each reference doing a different job:

| Layer | From | What it contributes |
|---|---|---|
| Structure and material | Kinetic Flux | Light canvas, floating white surfaces, layered depth, gradient wash |
| Motion | Kinetic Flux | 180 / 420 / 900ms, velocity-signals-hierarchy, 120ms stagger |
| Colour and warmth | Tropical | Accent palette, generous radii, the "fun" |
| Type | Tropical | Poppins + Quicksand — friendly, and neither is a system-UI clone |
| Composition | Suprematism | Bold blocks and asymmetry, in moderation, for empty states and stats |
| Data density | Airtable / Baserow / NocoDB | Grid, filter chips, inline edit, column controls |

The unresolved question is dark mode. Kinetic Flux is a light-first system and
Tropical's palette is tuned for white. Both need a dark counterpart designed
rather than inverted — saturated accents on dark shift hue badly and need
lightening to stay legible.

---

## Accessibility: what these palettes can and cannot do

WCAG 2.2 AA is the floor: 4.5:1 for body text, 3:1 for large text (24px, or
19px bold) and for UI borders and icons.

Most of these colours are **fills, not text.** That is normal for a vivid
palette and it is not a reason to reject one — it just decides where each
colour is allowed to appear.

| Colour | Hex | vs white | As text on white | As a fill, text on it |
|---|---|---:|---|---|
| **Tropical** | | | | |
| Palm | `#1a6b3c` | 6.54:1 | ✅ body text | white (6.5:1) |
| Jungle | `#2d8a4e` | 4.32:1 | ⚠️ large text / borders only | dark (4.9:1) |
| Canopy | `#3ba55d` | 3.12:1 | ⚠️ large text / borders only | dark (6.7:1) |
| Fern Light | `#8fd4a4` | 1.73:1 | ❌ never text | dark (12.1:1) |
| Coral | `#ff6b6b` | 2.78:1 | ❌ never text | dark (7.6:1) |
| Hibiscus | `#ff3e9d` | 3.27:1 | ⚠️ large text / borders only | dark (6.4:1) |
| Sunset | `#ff8c42` | 2.31:1 | ❌ never text | dark (9.1:1) |
| Golden Sand | `#ffe4a0` | 1.25:1 | ❌ never text | dark (16.9:1) |
| Lagoon | `#00b4d8` | 2.46:1 | ❌ never text | dark (8.5:1) |
| Ocean | `#0077b6` | 4.87:1 | ✅ body text | white (4.9:1) |
| Seafoam | `#90e0ef` | 1.49:1 | ❌ never text | dark (14.1:1) |
| **Kinetic Flux** | | | | |
| Chartreuse | `#7DFF5A` | 1.29:1 | ❌ never text | dark (16.3:1) |
| Cyan | `#2BB3FF` | 2.33:1 | ❌ never text | dark (9.0:1) |
| Orange | `#FF8A2B` | 2.35:1 | ❌ never text | dark (8.9:1) |
| Red | `#FF3B5C` | 3.48:1 | ⚠️ large text / borders only | dark (6.0:1) |
| **Suprematism** | | | | |
| Red | `#D62828` | 5.01:1 | ✅ body text | white (5.0:1) |
| Blue | `#003F88` | 10.16:1 | ✅ body text | white (10.2:1) |
| Yellow | `#F2C12E` | 1.69:1 | ❌ never text | dark (12.4:1) |

### What that means in practice

- **Chartreuse `#7DFF5A` at 1.29:1 is the headline trap.** It is Kinetic Flux's
  primary action colour and it cannot carry white text at any size. A
  chartreuse button needs near-black text on it, which is exactly what the
  reference does.
- **Coral, sunset, lagoon and seafoam are fills with dark text.** Fine for
  chips, the fill gauge, chart series and badges. Never for links or labels.
- **The usable text colours are narrow:** Palm `#1a6b3c`, Ocean `#0077b6`,
  Suprematism Blue `#003F88` and Red `#D62828`. Any accent that must be read as
  text comes from that short list, or gets darkened for the purpose.
- **Dark mode needs its own values.** The right-hand column is contrast against
  pure black; a real dark surface sits around `#111` and every number shifts.

Beyond colour: visible focus rings that survive the glass, keyboard reachability
for every control, correct roles and names, and honouring the three `prefers-*`
queries above. The Playwright suite is the natural place to assert the ones a
machine can check.

---

## Open questions for when this gets picked up

1. **Dark mode palette** — designed, not inverted. Which accents survive?
2. **How far does personality go?** Tropical at full strength is a holiday
   booking site. A whiskey collection probably wants its warmth and its radii,
   at maybe 60% of its saturation.
3. **Where does Suprematism appear?** Empty states and the dashboard, or is it
   dropped entirely?
4. **Fonts** — Poppins + Quicksand are friendly but not especially Apple. Worth
   testing against a system stack before committing.
5. **The fill gauge** (SPEC M4) is the visual centrepiece and the obvious place
   to prototype the whole language on one component before committing to it
   everywhere.
