# Rickhouse — Design Tokens

> **Implementation-level visual rules for Rickhouse.**
>
> `DESIGN.md` says what Rickhouse should feel like.
> This document says how that becomes tokens and code.

**Status (2026-10).** Updated for the new direction in `DESIGN.md`. Sections 1,
3.2, 7, 9, 27, 28, 58, 59 and 60 are new or replaced. **All other sections are
carried over unchanged from the previous direction and have not been reviewed
against the new one** (2, 3.1, 4 to 6, 8, 10 to 26, 29 to 57). The code in
`src/app/globals.css` still implements the previous values; migrating it is the
web redesign. Until a section is reviewed, treat carried-over values as the
current implementation, not as the target.

Do not introduce one-off visual values when an existing token can express the
intent. If a new value is genuinely necessary, first ask whether the design
system is missing a token.

Items marked *(proposed)* await the owner's confirmation. Items marked
*(undecided)* are open.

---

# 1. Core Philosophy

Rickhouse uses:

* warm paper and navy ink
* one category color per kind of spirit, on photo frames
* Inter for everything functional and Source Serif 4 for headlines only
* tabular figures for numbers
* hairline rules and borders
* real bottle photography
* a few contextual marks (tape and marker) for real bottle facts
* dense information where density helps

Rickhouse does **not** use:

* Rick or any mascot
* decorative tape, handwriting or scrapbook layouts
* glassmorphism or translucent UI as a default
* gradient backgrounds
* giant rounded cards or pill-everything
* excessive shadows
* color floods
* generic SaaS styling
* arbitrary one-off colors or spacing
* animation for its own sake

---

# 2. CSS Architecture

Use semantic design tokens rather than hard-coded values throughout components.

Preferred structure:

```css
:root {
  /* primitives */
  --color-ivory-50: ...;
  --color-ink-900: ...;

  /* semantic */
  --color-surface-page: ...;
  --color-surface-raised: ...;
  --color-text-primary: ...;

  /* components should consume semantic tokens */
}
```

Components should generally reference semantic tokens:

```css
background: var(--color-surface-raised);
color: var(--color-text-primary);
border-color: var(--color-border-default);
```

rather than primitives:

```css
background: #fffdf7;
color: #171717;
```

This makes dark mode and accessibility adjustments possible without rewriting components.

---

# 3. Color System

## 3.1 Base philosophy

The light interface should feel like warm paper, not a sterile white SaaS application.

Use subtle shifts between surfaces.

The differences should be visible enough to establish hierarchy but subtle enough that the interface still feels coherent.

---

## 3.2 Neutral palette

Target primitives (light mode):

```css
:root {
  --color-paper: #fff8e7;
  --color-ink: #14213d;
  --color-ink-on-color: #0a1226; /* proposed: text on colored frames */
  --color-rule: #14213d2e;       /* hairlines on paper */
}
```

The pre-existing paper and ink ramps in the code (`--color-paper-50` to
`--color-ink-300`) are the previous direction's primitives. The semantic tokens
in sections 4 to 6 must be re-pointed at the primitives above during the
redesign. The dark-mode values are *(undecided)*; keep the current dark tokens
until they are decided.

---

# 4. Semantic Surfaces

```css
:root {
  --color-surface-page: var(--color-paper-100);
  --color-surface-primary: var(--color-paper-50);
  --color-surface-secondary: var(--color-paper-200);
  --color-surface-tertiary: var(--color-paper-300);

  --color-surface-inverse: var(--color-ink-900);
}
```

### Usage

**Page**

Main application background.

**Primary**

Cards, dialogs, inputs, important surfaces.

**Secondary**

Grouped regions, table headers, subtle sections.

**Tertiary**

Dividers, selected regions, subtle structural areas.

Do not use a different surface for every component.

---

# 5. Text Colors

```css
:root {
  --color-text-primary: var(--color-ink-900);
  --color-text-secondary: var(--color-ink-700);
  --color-text-tertiary: var(--color-ink-500);
  --color-text-disabled: var(--color-ink-400);
  --color-text-inverse: var(--color-paper-50);
}
```

### Rules

Primary text should be highly readable.

Secondary text may carry metadata.

Tertiary text is for supporting information only.

Never use low-contrast text simply because it looks elegant.

---

# 6. Borders & Rules

Rickhouse relies heavily on rules and borders for structure.

```css
:root {
  --color-border-subtle: #dedbd2;
  --color-border-default: #c9c5ba;
  --color-border-strong: #969187;
  --color-border-ink: #242424;
}
```

Use borders to:

* establish table structure
* separate sections
* define controls
* create editorial rules
* establish physical boundaries

Prefer a single-pixel rule over a large shadow.

---

# 7. Category Colors

Sixteen categories; whiskey kinds each have their own color. The values come
from Pantone references; the hex values are the source of truth.

```css
:root {
  --category-vodka: #56b7e6;
  --category-gin: #48d597;
  --category-rum: #9678d3;
  --category-bourbon: #fc9350;
  --category-rye: #1caa3d;
  --category-scotch: #f4633a;
  --category-irish: #a6dd45;
  --category-japanese: #ba0c2f;
  --category-american-whiskey: #ca9a8e; /* other, ASM, ALW, corn */
  --category-canadian: #5461c8;
  --category-international-whiskey: #eab8e4;
  --category-amaro: #ef426f;
  --category-liqueur: #e93cac;
  --category-agave: #50a684;            /* tequila, mezcal */
  --category-brandy: #61007d;
  --category-other: #f7ea48;
}
```

The previous nine tokens (`--category-whiskey`, `--category-wine` and so on)
are retired. A whiskey is now one of its kinds. Wine has no category in the new
set.

## 7.1 Text on a category color

Each category pairs with one text color. Every pairing reaches 4.5:1.

| Text token | Used on |
|---|---|
| `--color-ink` | Vodka, Gin, Rum, Bourbon, Rye, Scotch, Irish, American whiskey, International whiskey, Agave, Other |
| `--color-ink-on-color` | Amaro, Liqueur (standard ink reaches only 4.3:1) |
| `--color-paper` | Japanese, Canadian, Brandy |

## 7.2 Usage

Category color may appear on photo frames (and, once background removal ships,
plates), as one small swatch beside the category name, and in chart series. It
must not fill screens, and it is not used as text on light backgrounds.

Residual categories (American whiskey, International whiskey, Other) are
deliberately quieter than the named kinds.

## 7.3 Accessibility

* Never communicate category by color alone: the category name is always
  printed with it.
* Amaro and Liqueur (9.6 apart) and Scotch and Amaro (9.9 apart) are the
  closest pairs in normal vision. Amaro with Agave (3.7) and Amaro with Rye
  (4.0) are close for red-green color blindness.
* Gin, Irish, International whiskey and Other have 1.2 to 1.8 contrast against
  paper, and Vodka, Bourbon, American whiskey, Rye, Scotch and Agave are under
  3. Every frame therefore carries a 1px ink hairline *(proposed)*.

---

# 8. Accent / System Colors

System colors should be separate from category colors.

```css
:root {
  --color-success: #2f7d4a;
  --color-warning: #a86600;
  --color-danger: #b42318;
  --color-info: #246b9b;
  --color-inferred: #b0410f;

  --color-focus: #005fcc;
}
```

These colors communicate system state.

`--color-inferred` (rust) marks a distillery worked out from outside the label,
by color, with a small "Inferred" note on mouse hover: no word or underline in the
table. It is deliberately not blue,
which reads as a link, and not a category hue.

Do not confuse them with spirit categories.

---

# 9. Typography

## 9.1 Font families

```css
--font-sans: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
--font-serif: "Source Serif 4", Georgia, "Times New Roman", serif;
```

* **Inter** for all UI, data, tables, labels, controls and numbers.
* **Source Serif 4** for headlines and short editorial lines only. Never for
  data, controls or body copy.
* Both are free and open-licensed. Bundle them (do not rely on a CDN) and
  subset to the needed languages *(proposed)*.
* The previous fonts (Aileron, Georgia as the display face) are the
  previous direction's values.

## 9.2 Numerals and optical size

```css
.numeric { font-variant-numeric: tabular-nums; }       /* numbers compared in columns */
h1, h2, .headline { font-family: var(--font-serif);
                    font-variant-numeric: lining-nums;   /* matches Inter's digits */
                    font-optical-sizing: auto; }          /* display cut at large sizes */
```

Lining figures are the default in the serif so headline counts match Inter's
digits. The old-style numerals of a different serif were the reason Junicode was
rejected.

---

# 10. Type Scale

Use a compact, deliberate scale.

```css
:root {
  --text-xs: 0.6875rem;   /* 11px */
  --text-sm: 0.75rem;     /* 12px */
  --text-md: 0.875rem;    /* 14px */
  --text-base: 1rem;      /* 16px */
  --text-lg: 1.125rem;    /* 18px */
  --text-xl: 1.375rem;    /* 22px */
  --text-2xl: 1.75rem;    /* 28px */
  --text-3xl: 2.25rem;    /* 36px */
  --text-4xl: 3rem;       /* 48px */
  --text-5xl: 4rem;       /* 64px */
  --text-6xl: 5rem;       /* 80px */
}
```

Not every page should use the entire scale.

---

# 11. Type Roles

```css
:root {
  --text-page-title: var(--text-4xl);
  --text-section-title: var(--text-2xl);
  --text-subsection-title: var(--text-xl);

  --text-body: var(--text-base);
  --text-body-small: var(--text-md);

  --text-label: var(--text-sm);
  --text-metadata: var(--text-xs);

  --text-stat: var(--text-5xl);
}
```

---

# 12. Font Weights

```css
:root {
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
  --weight-black: 800;
}
```

Prefer weight differences over excessive font-size changes.

---

# 13. Letter Spacing

```css
:root {
  --tracking-tight: -0.025em;
  --tracking-normal: 0;
  --tracking-wide: 0.04em;
  --tracking-wider: 0.08em;
}
```

Use wider tracking primarily for:

* metadata
* labels
* navigation
* category names
* editorial overlines

Do not letter-space body text excessively.

---

# 14. Line Height

```css
:root {
  --leading-tight: 1.05;
  --leading-snug: 1.2;
  --leading-normal: 1.45;
  --leading-relaxed: 1.65;
}
```

Large display numbers may use tight leading.

Body copy should remain comfortable to read.

---

# 15. Spacing

Use a 4px base unit.

```css
:root {
  --space-0: 0;
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */
  --space-24: 6rem;     /* 96px */
  --space-32: 8rem;     /* 128px */
}
```

Do not introduce arbitrary values like:

```css
margin: 17px;
padding: 29px;
gap: 13px;
```

unless there is a specific visual reason.

---

# 16. Density Tokens

Rickhouse needs explicit density modes.

```css
:root {
  --density-compact-row: 36px;
  --density-default-row: 44px;
  --density-comfortable-row: 52px;

  --density-table-cell-x: 12px;
  --density-table-cell-y: 8px;
}
```

Default Collection density should favor compact/default rather than oversized rows.

---

# 17. Container Widths

```css
:root {
  --container-sm: 640px;
  --container-md: 768px;
  --container-lg: 1024px;
  --container-xl: 1280px;
  --container-2xl: 1440px;
}
```

Rickhouse is a desktop-first workbench.

Do not constrain dense collection views to unnecessarily narrow widths.

---

# 18. Page Margins

Suggested desktop:

```css
--page-padding-inline: 32px;
```

Large displays may increase this toward:

```css
48px;
```

Mobile:

```css
--page-padding-inline-mobile: 16px;
```

Use responsive tokens rather than hard-coding page margins into individual screens.

---

# 19. Radius

Rickhouse is square. Corners are a signal, not a default: nearly everything
has none, so the few things that are rounded read as deliberate.

```css
:root {
  --radius-none: 0;
  --radius-sm: 4px;
  --radius-full: 9999px;

  /* Deliberately flattened: nothing should reach for these, and if a stray
     rounded-md / rounded-lg slips in, it renders square instead of soft. */
  --radius-md: 0;
  --radius-lg: 0;
  --radius-xl: 0;
}
```

### Default guidance

**0 (square)** — the default for every surface and control

* buttons, inputs, selects, textareas
* dialogs, popovers, menus and their items, tooltips
* tables and table cells
* sections, rules, editorial blocks
* images, thumbnails, gallery tiles
* alerts, empty states, the sticky edit bar

Consistency is the point: a square dialog holding square inputs and buttons,
opened over a square popover-driven filter row. A rounded surface anywhere in
that stack looks like a different product.

**4px (`--radius-sm`)** — physical labels only

* badges (category / status)
* the polaroid frame
* chart legend swatches

**9999px (`--radius-full`)** — things that are inherently round

* status and category dots
* progress tracks (the grain-total bar)
* the Spin the Bottle wheel
* small overlay chips on photos (fill %, bottle count, "Hero")
* circular icon buttons over images

Do not make every component `rounded-full`, and do not introduce 6–14px
radii. The one exception is the Spin the Bottle button, whose rainbow glow is
an intentionally expressive, one-off component.

---

# 20. Shadows

Shadows are secondary to borders and spacing.

```css
:root {
  --shadow-none: none;

  --shadow-sm:
    0 1px 2px rgb(23 23 23 / 0.08);

  --shadow-md:
    0 4px 12px rgb(23 23 23 / 0.10);

  --shadow-lg:
    0 10px 30px rgb(23 23 23 / 0.12);
}
```

Use sparingly.

Avoid stacking multiple large shadows.

Do not use shadows to create a fake floating-card aesthetic.

---

# 21. Focus States

Focus must always be visible.

```css
:root {
  --focus-width: 2px;
  --focus-offset: 2px;
  --focus-color: var(--color-focus);
}
```

Preferred:

```css
outline:
  var(--focus-width) solid var(--focus-color);

outline-offset:
  var(--focus-offset);
```

Never remove focus outlines without replacing them with an equally visible treatment.

---

# 22. Interactive States

Every interactive component should have explicit:

* default
* hover
* focus
* active
* disabled
* selected
* loading
* error

states where applicable.

Avoid changing layout dimensions between states.

For example, do not make a button physically grow enough on hover to move surrounding content.

---

# 23. Buttons

Buttons should be typographic and functional.

Preferred hierarchy:

### Primary

High-emphasis action.

### Secondary

Important but not dominant.

### Tertiary

Low-emphasis action.

### Destructive

Clearly destructive.

Avoid:

* gradient buttons
* giant pill buttons
* excessive shadows
* decorative button illustrations

A button should look like a button.

---

# 24. Inputs

Inputs should prioritize speed and clarity.

Initial:

```css
--input-height-sm: 32px;
--input-height-md: 40px;
--input-height-lg: 48px;
```

Default form controls should generally use `40px`.

Dense table controls may use `32px`.

Inputs should have:

* clear label
* clear focus
* clear error
* predictable keyboard behavior

Do not use placeholder text as the only label.

---

# 25. Tables

Tables are first-class Rickhouse UI.

Table rules:

* compact rows
* clear column alignment
* strong headers
* subtle horizontal rules
* minimal decoration
* keyboard-friendly editing
* sortable columns
* filterable columns
* sticky headers where useful

Avoid putting every row inside a card.

A Rickhouse table should look like a **beautiful reference table**, not a collection of mini cards.

---

# 26. Cards

Cards are allowed but should be purposeful.

Use cards for:

* distinct objects
* meaningful content groups
* gallery items
* editorial modules
* dialogs
* physical objects

Do not use cards for:

* every metric
* every field
* every table row
* every navigation item
* every piece of metadata

If removing the card would make the information hierarchy clearer, remove it.

---

# 27. Marks (tape and marker)

Tape and marker appear only for facts a person would write on a real bottle:
**open date, gifted-by, store pick, location.** They are never decoration.

```css
:root {
  --mark-tilt-max: 2deg; /* proposed */
}
```

Rules:

* A mark is a component with a fixed slot, not placed by hand.
* Tilt at most `--mark-tilt-max`.
* Marks never overlap content or touch targets.
* Each has a plain-text equivalent for assistive technology.
* They scale with system text size up to a cap *(proposed)*.

The tape colors in the code (`--color-tape-coral` through
`--color-tape-neutral`, and `--color-tape-ink`) are the previous direction's.
Which colors the new tape uses, and its look, are *(undecided)*; keep the
existing tokens until decided.

---

# 28. Handwriting

Handwriting is for marks only. It is never the only source of information.

* Provide an accessible equivalent text.
* Do not use it for essential controls.
* Keep it short (one to three words) and legible.

The marker typeface is *(undecided)*.

---

# 29. Rules / Dividers

Editorial rules are important.

Preferred:

```css
border-top: 1px solid var(--color-border-default);
```

Use thicker rules when intentionally creating a section break.

Avoid:

* gradient dividers
* glowing dividers
* giant decorative lines with no purpose

---

# 30. Motion Tokens

Motion is physical and contextual.

Initial timing:

```css
:root {
  --duration-instant: 80ms;
  --duration-fast: 140ms;
  --duration-normal: 220ms;
  --duration-slow: 360ms;
  --duration-dramatic: 600ms;
}
```

These replace the earlier generic 180/420/900ms system.

Most UI interaction should live between:

**140–220ms**

Special expressive moments may use:

**360–600ms**

Do not use long animation simply to make a transition feel "premium."

---

# 31. Motion Easing

Use a small number of easings.

```css
:root {
  --ease-standard:
    cubic-bezier(0.2, 0, 0, 1);

  --ease-enter:
    cubic-bezier(0.16, 1, 0.3, 1);

  --ease-exit:
    cubic-bezier(0.7, 0, 0.84, 0);

  --ease-spring:
    cubic-bezier(0.22, 1.2, 0.36, 1);
}
```

### Standard

Routine UI transitions.

### Enter

Elements appearing.

### Exit

Elements leaving.

### Spring

Physical/contextual interactions only.

Do not use spring physics everywhere.

---

# 32. Motion Hierarchy

Motion should communicate hierarchy.

### Micro interaction

80–140ms.

Examples:

* hover
* focus
* selection

### Standard interaction

140–220ms.

Examples:

* menus
* filters
* expanding controls

### Meaningful transition

220–360ms.

Examples:

* view changes
* gallery movement
* object transformation

### Expressive moment

360–600ms.

Examples:

* milestone
* opening a bottle
* major discovery
* Rick reaction

Never make routine actions use expressive timing.

---

# 33. Reduced Motion

Respect:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Non-essential motion should disappear.

The interface must remain completely understandable.

---

# 34. Sound Tokens

Sound is optional.

Do not hard-code audio volume or assume sound is available.

Conceptual sound categories:

```text
ui.click
ui.confirm
ui.error
ui.paper
ui.bottle
milestone.discovery
milestone.opening
```

Sound must never be the only feedback mechanism.

---

# 35. Z-Index

Use a controlled layering system.

```css
:root {
  --z-base: 0;
  --z-raised: 10;
  --z-sticky: 100;
  --z-dropdown: 200;
  --z-overlay: 300;
  --z-modal: 400;
  --z-toast: 500;
  --z-max: 999;
}
```

Do not invent arbitrary values such as:

```css
z-index: 99999;
```

unless there is an actual architectural reason.

---

# 36. Responsive Breakpoints

Use a small number of meaningful breakpoints.

```css
:root {
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
  --breakpoint-2xl: 1440px;
}
```

Do not create breakpoints for individual devices.

Breakpoints should correspond to layout changes.

---

# 37. Responsive Strategy

### Desktop

Workbench.

Prioritize:

* density
* simultaneous information
* keyboard interaction
* multi-column layouts
* rich browsing

### Tablet

Recompose.

Reduce simultaneous information while retaining meaningful density.

### Mobile

Field companion.

Prioritize:

* lookup
* capture
* editing
* photos
* tasting
* location
* quick actions

Do not simply scale desktop down.

---

# 38. Gallery Tokens

Gallery needs more visual freedom than the table.

Suggested baseline:

```css
:root {
  --gallery-gap: var(--space-6);
  --gallery-item-min: 180px;
  --gallery-item-max: 280px;
}
```

Gallery objects may:

* overlap slightly
* vary in size
* cluster
* stagger

But the composition should still have an underlying grid.

---

# 39. Table Tokens

```css
:root {
  --table-header-height: 36px;

  --table-row-height-compact: 36px;
  --table-row-height-default: 44px;
  --table-row-height-comfortable: 52px;

  --table-cell-padding-inline: 12px;
  --table-cell-padding-block: 8px;

  --table-thumbnail-size: 32px;
}
```

Table density should be configurable.

Default:

```css
--table-row-height-default: 44px;
```

Power users should be able to select compact density.

---

# 40. Bottle Image Tokens

```css
:root {
  --bottle-thumb-sm: 28px;
  --bottle-thumb-md: 40px;
  --bottle-thumb-lg: 64px;
  --bottle-image-detail: 480px;
}
```

Catalog photography should generally use a consistent object treatment.

Life photography can be freer.

---

# 41. Status Tokens

Bottle lifecycle states should not become badge soup.

Use a restrained visual vocabulary.

```css
:root {
  --state-open: #c96f2f;
  --state-empty: #77736b;
  --state-special: #7b5c91;
}
```

OPEN should be immediately recognizable.

Do not use six brightly colored badges to communicate six tiny states.

---

# 42. Data Visualization Tokens

Charts should inherit category colors.

Use semantic fallback series when necessary:

```css
:root {
  --chart-neutral: #6d6a63;
  --chart-grid: #ddd9cf;
  --chart-axis: #969187;
  --chart-label: #555555;
}
```

Charts should prioritize:

1. question
2. comparison
3. underlying data
4. decoration

Never reverse that order.

---

# 43. Dark Mode

Dark mode should be designed independently.

Initial foundation:

```css
[data-theme="dark"] {
  --color-surface-page: #181713;
  --color-surface-primary: #211f1a;
  --color-surface-secondary: #292720;
  --color-surface-tertiary: #343129;

  --color-text-primary: #f4f1e8;
  --color-text-secondary: #d1cdc2;
  --color-text-tertiary: #aaa59a;

  --color-border-subtle: #3b3830;
  --color-border-default: #514d43;
  --color-border-strong: #777166;
}
```

Category colors should be adjusted for dark surfaces where necessary.

Do not simply invert the light palette.

Do not introduce neon cyberpunk aesthetics.

---

# 44. Accessibility Contrast

Target WCAG 2.2 AA.

Minimum targets:

* normal text: 4.5:1
* large text: 3:1
* meaningful UI boundaries/icons: 3:1

Do not use category colors as text simply because they are visually attractive.

If a color fails contrast:

* darken it
* use it as a fill
* use it as a decorative accent
* or provide a stronger semantic alternative

Never sacrifice readability for brand color.

---

# 45. Semantic Color Rules

Do not make category colors double as system colors.

For example:

**Orange whiskey**

does not mean:

**warning**

The semantic meaning must remain independent.

This prevents category colors from becoming confusing as the application grows.

---

# 46. Empty State Tokens

Empty states may have more expressive visual treatments.

Suggested:

```css
--empty-state-min-height: 280px;
--empty-state-padding: var(--space-12);
```

But do not make every empty state a giant centered illustration.

Use contextual layouts where appropriate.

---

# 47. Toast Tokens

```css
:root {
  --toast-width: 360px;
  --toast-padding: 12px 16px;
  --toast-offset: 16px;
}
```

Toasts should be:

* compact
* readable
* non-blocking
* visually connected to Rickhouse

Toasts do not use tape or marker. Marks are reserved for real bottle facts (section 27).

---

# 48. Modal / Dialog Tokens

```css
:root {
  --dialog-max-width-sm: 420px;
  --dialog-max-width-md: 640px;
  --dialog-max-width-lg: 880px;

  --dialog-padding: 24px;
  --dialog-radius: var(--radius-none);
}
```

Dialogs should not become giant floating glass panels.

Use opaque surfaces. Dialogs are square, like the popovers, buttons and
inputs they sit alongside (§19). A dialog genuinely floats above the page, so
it keeps a border and a shadow; the corners stay square.

---

# 49. Layering Model

Rickhouse should have a simple visual hierarchy:

```text
Page
├── Content
├── Raised surfaces
├── Sticky/navigation
├── Dropdowns
├── Overlays
├── Dialogs
└── Toasts
```

Avoid excessive depth.

The interface should feel mostly grounded.

---

# 50. Physicality Intensity

Physical treatments should have an implicit intensity scale.

### Level 0 — Clean

Use for:

* Settings
* dense tables
* forms
* reference data

### Level 1 — Hint

Use for:

* Collection
* Labels
* standard Bottle Detail

### Level 2 — Expressive

Use for:

* Home
* Gallery
* Groups
* Numbers discoveries

### Level 3 — Special

Use for:

* milestones
* major bottle openings
* rare discoveries
* onboarding
* special Rick moments

Do not use Level 3 everywhere.

---

# 51. Personality Intensity

Personality should similarly have levels.

```text
Quiet
  ↓
Observant
  ↓
Nosy
  ↓
Unhinged
```

The default is:

**Nosy**

Personality intensity should influence:

* copy frequency
* Rick appearances
* observations
* animation
* special notifications

It should not alter core usability.

---

# 52. Component Creation Rules

Before creating a new component:

1. Check whether an existing component already solves the problem.
2. Check whether the new component can use existing tokens.
3. Check whether a new visual treatment is actually necessary.
4. Check desktop and mobile behavior.
5. Check keyboard behavior.
6. Check reduced motion.
7. Check contrast.
8. Check whether the component introduces unnecessary visual noise.

Do not create a new component solely because two pages have slightly different styling.

---

# 53. One-Off Values

Avoid:

```css
color: #e87b31;
border-radius: 17px;
margin-top: 23px;
box-shadow: 0 7px 21px rgba(...);
```

if an existing token can express the intent.

If a one-off value is genuinely necessary, ask:

> Should this become a token?

If the answer is yes, add it to this file.

---

# 54. Claude Code Guardrails

When modifying the UI, Claude should **not**:

* replace Helvetica Now without a reason
* introduce Tailwind-style arbitrary values everywhere
* add gradients by default
* add glassmorphism
* add generic rounded cards
* turn tables into cards
* add large shadows
* increase whitespace without a usability reason
* add animation to every component
* introduce new colors casually
* introduce new radii casually
* add a new icon library just for one feature
* add Rick to fill empty space
* rewrite existing components when a token adjustment solves the problem
* create a second visual language inside one page
* optimize screenshots at the expense of actual information density

---

# 55. Claude Code Decision Rule

When an implementation choice is ambiguous:

### First

Choose the most usable option.

### Second

Choose the option that preserves the grid.

### Third

Choose the option that uses existing tokens.

### Fourth

Choose the option that feels more physical/editorial.

### Fifth

Add personality only if the context supports it.

This order matters.

---

# 56. Design QA

Before shipping a UI change, verify:

### Typography

* Helvetica Now is being used correctly.
* Hierarchy is clear.
* No unnecessary fonts were introduced.

### Color

* Category color is meaningful.
* System colors are separate.
* Contrast passes.
* Color isn't the only information cue.

### Layout

* Grid alignment is intentional.
* Density is appropriate.
* Mobile recomposes rather than shrinks.

### Components

* No unnecessary cards.
* No pill-everything.
* No excessive radius.
* No shadow soup.

### Physicality

* Any tape/handwriting/illustration is contextual.
* Physicality doesn't obscure information.

### Motion

* Motion communicates something.
* Routine actions remain fast.
* Reduced motion works.

### Personality

* The data earns the joke.
* Rick isn't being used as decoration.
* Copy remains concise.

### Accessibility

* Keyboard navigation works.
* Focus is visible.
* Semantic labels exist.
* Contrast is sufficient.
* Screen-reader meaning is preserved.

---

# 57. Final Token Principle

Tokens exist to create **consistency without uniformity**.

Rickhouse should feel like one coherent world without making every component look identical.

The Collection table should not look like a Group page.

A Label reference page should not look like Home.

A Numbers discovery should not look like Settings.

They share:

* typography
* spacing
* color logic
* grid
* borders
* interaction principles

They differ in:

* density
* physicality
* photography
* personality
* composition
* motion

That is intentional.

---

# 58. Photo Frame and Bottle Card

```css
:root {
  --frame-width: 6px;               /* proposed; test 6 to 8px at card scale */
  --frame-outline: 1px solid var(--color-ink);   /* proposed: every frame */
  --card-photo-aspect: 3 / 4;       /* proposed: portrait */
  --card-fact-max-chars: 14;        /* proposed: fact slot length */
}
```

The frame is colored by category (`--category-*`) with the matching text token
from section 7.1. When background removal ships, the frame's interior fills
with the same color and becomes a plate; the footprint does not change. A plate
means a cutout succeeded.

Fact slot defaults and the density rule (3 columns show one fact, 2 show two,
a wide gallery three) are in `DESIGN.md` section 4.3.

---

# 59. Targets and Spacing

```css
:root {
  --target-min-ios: 44pt;
  --target-min-android: 48dp;
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;  --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px;   /* proposed scale */
}
```

The spacing scale is a 4px base. Section 15 (carried over) lists the previous
spacing tokens; reconcile them with this scale during the redesign.

---

# 60. The Final Rule

When in doubt, apply the decision order in `DESIGN.md` section 11: the bottle
comes first, structure stays quiet, color means category only, a mark is a real
fact a person would write on a bottle, and the voice lives in the headline.
