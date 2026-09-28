# Rickhouse — Design System

> **A Swiss-designed field guide to an eccentric liquor collection.**
>
> Precision underneath. Humanity on top.
>
> Rickhouse takes the collection seriously. It does not take itself seriously.

This document is the canonical visual and interaction direction for Rickhouse.

It supersedes earlier explorations of Liquid Glass, Tropical, and Suprematist visual systems. Those references may still provide isolated useful ideas, but they are **not** the design language of Rickhouse.

When implementing or changing UI, use this document as the source of truth.

---

# 1. Design North Star

Rickhouse should feel like:

* a beautifully designed field guide
* an obsessive collector's notebook
* a well-organized research library
* an eccentric person's home bar
* a place where someone has been documenting bottles for years
* a serious database that happens to have a personality

It should **not** feel like:

* a generic SaaS dashboard
* an Apple Liquid Glass clone
* a luxury spirits website
* a fintech dashboard
* a minimalist portfolio
* a scrapbook app
* a children's app
* an AI-generated "premium" interface
* a museum for liquor
* a database that has been decorated with random whimsy

### The fundamental tension

Rickhouse has two layers:

**Structure**

* Swiss typography
* rigorous grids
* dense information
* clear hierarchy
* predictable interaction
* excellent usability
* consistent components

**Humanity**

* photography
* color
* painter's tape
* Sharpie annotations
* handwriting
* imperfect illustrations
* Rick
* contextual jokes
* physical-feeling interactions
* occasional visual rebellion

The structure is permanent.

The humanity appears where it has something to say.

---

# 2. Five Rules That Govern Everything

## 2.1 The grid is the rule. Breaking the grid is the reward.

Layouts should begin from a disciplined grid.

Things may deliberately overlap, span unusual widths, or break alignment when doing so creates meaning.

Never introduce asymmetry merely because asymmetry looks fashionable.

---

## 2.2 Precision underneath. Humanity on top.

The underlying data model and UI system should be extremely precise.

Physical imperfections are a surface treatment.

Do not make the interface structurally messy in an attempt to make it feel handmade.

---

## 2.3 The data earns the joke.

Rickhouse should not constantly make jokes.

Personality should emerge from actual collection data.

Good:

> You own 11 bottles from this distillery.
> I think we need to talk about your type.

Bad:

> WELCOME BACK, BOTTLE BUDDY!!! 🥳🥃

The more meaningful the observation, the more personality Rickhouse can have.

---

## 2.4 Utility is never sacrificed for personality.

Data entry should be fast.

Tables should be dense.

Search should be immediate.

Filters should be obvious.

Keyboard navigation should work.

Important information should never be hidden behind a visual gag.

---

## 2.5 Rickhouse should feel collected, not generated.

Avoid patterns that make the interface look like it came from an AI-generated SaaS template.

The design should contain evidence of human use:

* real bottle photography
* personal photos
* annotations
* notes
* stories
* imperfect marks
* meaningful color
* evolving collections
* contextual interventions

---

# 3. Visual Identity

## 3.1 Swiss foundation

The underlying visual language is influenced by Swiss graphic design:

* strong typography
* disciplined grids
* asymmetrical but intentional composition
* clear hierarchy
* generous but purposeful alignment
* rules and dividers
* strong use of negative space when useful
* information treated as visual material

Swiss design provides the **discipline**.

It does not mean Rickhouse should feel sterile.

---

## 3.2 Field-guide sensibility

References should feel closer to:

* field notebooks
* archival labels
* natural-history guides
* collector catalogs
* Field Notes
* laboratory documentation
* annotated reference books

than:

* luxury liquor advertising
* hotel websites
* enterprise software
* glossy lifestyle magazines

The interface should feel like someone is actively documenting a collection.

---

## 3.3 Lived-in, not distressed

Do not add fake wear everywhere.

Avoid:

* artificial paper textures
* fake stains
* excessive grain
* fake torn edges
* random tape
* random scribbles
* faux vintage filters

Physicality should feel intentional.

A piece of painter's tape should look like it is there because somebody put it there.

---

# 4. Color

## 4.1 Overall philosophy

Rickhouse should be colorful.

Color is not decoration. It is part of the information architecture.

Color should primarily:

1. identify spirit categories
2. highlight something important
3. create visual rhythm
4. distinguish contexts
5. celebrate something
6. occasionally make something funny

Avoid generic SaaS color conventions where blue means "primary," purple means "AI," green means "success," etc.

---

## 4.2 Base surfaces

The canonical light environment uses slightly warm, varied neutrals.

Use a family of near-whites rather than one pure white:

* warm ivory
* cream
* pale gray
* slightly yellowed paper
* clean white for contrast

Do **not** use obvious parchment textures.

The variation should come primarily from color, spacing, borders, and layering.

---

## 4.3 Category colors

Spirit categories should own their visual territories.

Example direction:

| Category | Direction               |
| -------- | ----------------------- |
| Agave    | pink / coral            |
| Whiskey  | orange / amber / yellow |
| Gin      | green                   |
| Rum      | red                     |
| Vodka    | blue                    |
| Liqueurs | purple                  |

Exact colors should be refined as tokens.

Category colors should feel like:

* painter's tape
* ink
* packaging
* labels
* physical materials

They should not feel like status indicators.

### Accessibility requirement

Color must never be the only indication of meaning.

A category must also be represented through:

* text
* iconography
* shape
* label
* position
* or another redundant cue

---

## 4.4 No gradients by default

Do not use gradients as decorative background treatment.

A gradient is allowed only when it has a clear purpose and is explicitly justified.

Do not use:

* gradient hero backgrounds
* gradient buttons
* gradient glass
* glowing blobs
* generic "modern SaaS" gradients

---

# 5. Typography

## 5.1 Primary typeface

**Helvetica Now** is the preferred workhorse.

Use it for:

* navigation
* headings
* labels
* tables
* numbers
* metadata
* controls
* forms
* buttons
* filters
* system information

Typography should feel confident and extremely legible.

---

## 5.2 Secondary/editorial type

A restrained serif may be used for:

* bottle stories
* longer editorial notes
* special quotes
* historical/contextual writing
* occasional Home storytelling

The serif is an accent, not a second UI system.

Do not use a quirky display font throughout the application.

---

## 5.3 Type hierarchy

Hierarchy should come primarily from:

1. size
2. weight
3. spacing
4. alignment
5. color
6. case

Do not create hierarchy by using ten different fonts.

---

## 5.4 Numbers

Numbers are important visual objects in Rickhouse.

Large numbers should feel:

* precise
* editorial
* slightly obsessive

Numbers pages may use unusually large typography when a statistic deserves attention.

---

# 6. Layout

## 6.1 Grid

Use a consistent responsive grid.

The grid should establish:

* page margins
* column relationships
* content widths
* alignment
* section rhythm

Major page elements should generally align to the same underlying grid.

---

## 6.2 Density

Rickhouse is a data-heavy application.

Density is a feature.

Do not introduce excessive whitespace merely because it makes a screenshot look "clean."

A useful rule:

> If information can be comfortably visible without making the interface harder to understand, prefer showing it.

The Collection table should feel dense and efficient.

Home and Gallery can breathe more.

---

## 6.3 Containers

Avoid generic rounded containers around everything.

A container should communicate a real relationship:

* grouped data
* a distinct interactive region
* a physical object
* a meaningful section
* a modal/sheet
* a visual composition

Do not wrap every statistic in a rounded rectangle.

---

# 7. Borders, Rules & Depth

Rickhouse does not rely on floating cards and shadows for hierarchy.

Prefer:

* spacing
* typography
* rules
* borders
* alignment
* background shifts
* physical interventions

Shadows should be subtle and contextual.

Avoid:

* huge soft shadows
* floating-card soup
* glowing edges
* glass blur
* frosted panels as the default surface

Physical objects may occasionally have real-looking depth.

The interface itself should remain relatively flat and graphic.

---

# 8. Radius

Corners should be restrained.

Do not use pills and giant rounded rectangles as the default language.

Square is the default for surfaces and controls: buttons, inputs, dialogs,
popovers, tables and imagery. Radius is kept for the few places it makes
physical sense:

* physical labels (badges, the polaroid) at 4px
* things that are inherently round (dots, the spin wheel, overlay chips)

See DESIGN-TOKENS.md §19 for the exact scale.

The radius should support the object rather than define the brand.

---

# 9. Photography

Photography is one of Rickhouse's most important visual assets.

## 9.1 Every bottle has two photographic identities

### Catalog photo

Answers:

> What is this?

Characteristics:

* recognizable
* consistent
* clean
* useful at small sizes
* suitable for tables and reference views

### Life photos

Answer:

> What happened to this?

Examples:

* discovered at a bar
* purchased on a trip
* sitting on a shelf
* dinner
* tasting
* person who gave it
* label detail
* receipt
* packaging

Life photos may be:

* imperfect
* messy
* cropped
* personal
* editorial

---

## 9.2 Photography is not decoration

Bottle photography should communicate information and identity.

Do not bury useful bottle imagery inside generic cards.

The bottle should remain recognizable even when the surrounding interface becomes expressive.

---

# 10. Physical Interventions

Physical elements are contextual tools, not the entire layout system.

Possible interventions:

* painter's tape
* Sharpie handwriting
* stamps
* annotations
* scribbles
* crooked labels
* overlaps
* paper edges
* hand-drawn arrows
* Rick doodles

Use them sparingly.

### Painter's tape

Painter's tape is an important recurring visual device.

It may be used for:

* category labels
* OPEN
* BACK BAR
* GIFT
* special collections
* warnings
* jokes
* contextual annotations

It should look physical rather than like a generic UI badge.

---

# 11. Rick

Rick is the recurring character of Rickhouse.

He is based on a white Aussiepoo.

## 11.1 Rick is not the UI mascot

Rick should never appear simply because there is an empty space.

He is not:

* permanent navigation chrome
* a floating assistant
* a chat bubble
* an icon replacement
* present on every page

### Principle

> Rick lives here. He doesn't work here.

---

## 11.2 Two Rick styles

### Canonical Rick

A polished illustration used for:

* onboarding
* major empty states
* milestones
* brand moments
* special events
* important discoveries

### Doodle Rick

Rough black-ink / Sharpie-style drawings used in margins and contextual moments.

Doodle Rick should feel like:

> someone has been casually drawing their dog in the margins of their collection notebook for years.

---

## 11.3 Rick's visual style

Rick should combine:

* Field Notes-like ink drawing
* Swiss graphic simplicity
* children's-book expressiveness

Characteristics:

* black ink
* simple geometric construction
* strong silhouette
* negative space
* imperfect lines
* expressive body language
* occasional category colors

Avoid:

* Pixar
* generic SaaS mascot
* glossy 3D character
* overly polished cartoon branding

---

# 12. Voice

Rickhouse speaks like a smart friend who gives you shit.

Secondary influences:

* bartender
* eccentric archivist
* dry/deadpan observer

The voice should be:

* conversational
* intelligent
* concise
* occasionally profane
* observant
* never corporate

---

## 12.1 Personality frequency

Rickhouse knows when to shut up.

### Data entry

Quiet.

### Collection browsing

Occasional observations.

### Home

More personality.

### Bottle stories

Conversational.

### Numbers / discoveries

Highly observant.

### Milestones

Celebratory.

---

## 12.2 Profanity

Profanity is contextual.

Normal:

> You have 14 bottles of bourbon.

Concerned:

> You already have 14 bottles of bourbon.

Alarmed:

> Zach, what the fuck.

Never use profanity simply to seem edgy.

---

# 13. Proactive Intelligence

Rickhouse should actively notice patterns in the collection.

Potential observations:

* purchasing patterns
* category shifts
* favorite distilleries
* spending changes
* unopened bottles
* bottles owned for unusually long periods
* duplicate purchases
* near-duplicate purchases
* unusual proof distributions
* age patterns
* geographic concentrations
* tasting-note patterns
* anniversaries
* collection milestones
* statistical outliers

This should feel like genuine observation, not generic notification spam.

### Personality settings

Default:

**Nosy**

Available:

* Quiet
* Observant
* Nosy
* Unhinged

Rickhouse should pay attention by default.

The user decides how much it talks.

---

# 14. Navigation

Canonical navigation:

**Home · Collection · Labels · Groups · Numbers · Settings**

Do not rename Collection to "Cabinet."

---

## 14.1 Navigation philosophy

Global navigation should be:

* stable
* predictable
* typographic
* grid-aligned
* restrained

Workspace controls can change based on context.

Use:

> Swiss foundation + physical interventions.

Navigation should never become scrapbook-like.

---

# 15. Information Architecture

## Collection

What the user physically owns.

## Labels

The canonical reference library.

A Label is the product/reference record.

Example:

> Weller 107

A Bottle is a physical instance of a Label.

Example:

> Weller 107 — Bottle #3
> ABC Liquors Store Pick
> Barrel #1234

### Core distinction

> Labels are knowledge. Collection is ownership.

---

## Groups

Personal, curated collections.

Examples:

* Japan 2026
* Store Picks
* Mara's Bottles
* Bought Under $50
* Things I Want to Drink Soon
* Why Did I Buy This?

A bottle can belong to multiple Groups.

Groups are not merely saved filters.

> The database tells you what you own. Groups tell you what it means.

---

## Numbers

Analytics and discovery.

Numbers should begin with curiosity and progressively reveal deeper analytics.

---

# 16. Collection

Collection is the primary workbench.

Default:

**TABLE VIEW**

Optional:

**GALLERY VIEW**

Potential additional views:

* Timeline
* Numbers
* other future collection perspectives

---

# 17. Collection Table

The table should be:

* dense
* sortable
* filterable
* editable
* keyboard-friendly
* information-rich

Example:

```text
[thumbnail] Name | Category | Distillery | Proof | Age | Purchase Price | Opened | ...
```

The table should show a lot of bottles without feeling cramped.

---

## 17.1 Thumbnail

Bottle thumbnails should be:

* small
* recognizable
* consistent
* useful

They should not dominate the row.

Hover/focus can provide a larger preview.

Missing photography should have an intentional placeholder rather than an empty broken-image state.

---

## 17.2 Bottle state

OPEN must be immediately obvious.

Do not rely on a giant badge.

Use a compact, unmistakable treatment.

Possible lifecycle:

**Unopened → Open → Almost Gone → Empty**

Additional states may include:

* Gifted
* Sold
* Lost/Misplaced

---

# 18. Gallery

Gallery is where personality increases.

Principle:

> Table = perfect organization.
> Gallery = curated accumulation.

Normally:

* consistent scale
* strong grid
* intentional rhythm
* beautiful photography

When bottles have meaningful relationships:

* cluster
* stack
* stagger
* overlap
* family-group them

Example:

> WELLER 107 — 4 BOTTLES

The database sees four bottles.

The gallery can see a family.

The more meaningful the relationship between objects, the more physical the composition can become.

---

# 19. Bottle Detail

Every bottle has the same underlying facts and functionality.

Presentation may change depending on the bottle's story.

A Bottle Detail page may include:

* catalog information
* acquisition
* purchase information
* ownership
* location
* fill level
* opening state
* tasting notes
* people
* places
* experiences
* photos
* receipts
* packaging
* historical context
* related bottles
* Groups
* timeline

Core principle:

> The bottle isn't just an inventory record. It's an object with a story.

---

# 20. Bottle History

Rickhouse catalogs the life of a bottle, not just the bottle.

Timeline events may include:

* discovery
* acquisition
* purchase
* gift
* trip
* tasting
* opening
* photos
* notes
* people
* places
* memories
* changes in fill level
* movement between locations

Historical information should remain even when a bottle becomes empty.

---

# 21. Bottle Fill Level

Fill level is visual, not laboratory-precise.

States:

* Full
* ¾
* ½
* ¼
* Almost Gone
* Empty

The interface should communicate approximate physical reality.

Do not require users to estimate ounces unless a future feature explicitly calls for it.

---

# 22. Add Bottle

Adding a bottle should be:

> A great data-entry form wearing a little costume.

The underlying interaction must be:

* fast
* keyboard-friendly
* predictable
* efficient

Personality happens after the save.

Potential sequence:

1. Bottle saved
2. category color assigned
3. collection count updates
4. bottle enters collection
5. small physical transition
6. optional Rick reaction
7. contextual confirmation

Never force an animation before the user can continue working.

---

# 23. Groups

Groups are scrapbook-like curated collections.

They should feel more handmade than the Collection.

Possible elements:

* cover image
* handwritten description
* bottles arranged in clusters
* personal photos
* painter's tape
* annotations
* Rick doodles
* dates
* locations
* bottle relationships

Each Group can have its own visual identity.

But the underlying data remains real and structured.

---

# 24. Numbers

Numbers begins with:

> "Huh, that's interesting."

Then:

> "Why?"

Then:

> "Show me the data."

Then:

> "Let me investigate."

Examples:

> YOUR MOST EXPENSIVE BOTTLE
> $640
> And you haven't opened it.

> YOU HAVE 17 BOTTLES FROM KENTUCKY.

> MOST OF YOUR COLLECTION IS 90–110 PROOF.

> YOU'VE OWNED 6 BOTTLES FOR MORE THAN 5 YEARS.

Observations should link directly to the underlying bottles and records.

Numbers is not KPI-card soup.

---

# 25. Timeline

Timeline is a first-class experience.

It should show how the collection happened.

Possible events:

* acquisitions
* discoveries
* trips
* gifts
* tastings
* openings
* photos
* milestones
* notes
* memories

Timeline may exist globally and within:

* bottles
* Groups
* Labels

Core idea:

> Rickhouse doesn't just show what you own. It shows how the collection happened.

---

# 26. Physical Locations

Model the physical world now.

Visualize it later.

Useful defaults:

* Home Bar
* Kitchen
* Storage
* Off-site

Support future nested locations:

```text
Home
  → Bar
    → Shelf 2
      → Left Side
```

Also support arbitrary locations such as:

* Friend's House
* Vacation Home
* Storage Unit

Location should be optional where appropriate.

---

# 27. Search & Filtering

Search should be:

> Powerful but approachable.

Provide:

* instant search
* forgiving matching
* combined filters
* obvious sorting
* common filters with one click
* advanced combinations without query language
* clear active-filter state
* easy filter removal

Do not make users learn database syntax.

Principle:

> Simple to ask. Powerful when you care.

---

# 28. Home

Home is not a dashboard.

It is:

> **A living field notebook.**

It should feel like someone is actively keeping a beautiful, slightly unhinged collection journal.

Use a structured modular grid.

Modules may include:

* recent bottles
* discoveries
* collection observations
* bottle photography
* statistics
* timeline moments
* milestones
* notes
* Rick interventions

The interesting material may spill into the margins.

> The grid is the notebook. The interesting stuff gets to spill into the margins.

Home should make the user think:

1. Oh shit, this is fun.
2. Holy shit, look at my collection.
3. Whoa, I can actually see what's going on.

---

# 29. Mobile

Desktop is the:

> **Workbench**

Mobile is the:

> **Field companion**

Mobile should prioritize:

* quick bottle lookup
* adding bottles
* taking photos
* tasting notes
* checking ownership
* updating fill
* updating location
* recording stories

Do not simply shrink desktop layouts.

Recompose them.

---

# 30. Responsive Behavior

Use fluid layouts where appropriate.

Use deliberate breakpoints when the interaction model needs to change.

Never:

* squeeze desktop tables into unreadable mobile layouts
* shrink everything proportionally
* preserve desktop composition at all costs

Rich Bottle Detail can remain rich.

Dense analytics can use progressive disclosure.

---

# 31. Forms

The more frequently a form is used, the quieter it should be.

Routine forms:

* efficient
* compact
* predictable
* keyboard-friendly
* minimal decoration

Special forms can be more expressive:

* Add Bottle
* Tasting
* Group creation
* Open Bottle
* Import

Principle:

> The more often I use it, the less it gets in my way.

---

# 32. Iconography

> Function is Swiss. Meaning can be weird.

Functional icons should be:

* clean
* geometric
* consistent
* immediately understandable

Use custom illustrations or physical marks when they communicate something beyond a control's function.

Distinction:

> **Icon:** tells you what a control does.
> **Illustration/mark:** tells you something about the world you're in.

Do not replace standard interaction icons with confusing drawings.

---

# 33. Motion

Motion should feel:

1. satisfying
2. playful
3. exploratory

In that order.

---

## 33.1 Satisfying

Motion should make interaction feel physical:

* dragging
* snapping
* sorting
* reordering
* number changes
* chart growth
* bottle movement

---

## 33.2 Playful

Occasional contextual reactions:

* bottle wobble
* painter's tape shifting
* Rick appearing
* ridiculous stat interrupting the grid
* high-proof/hazmat jokes
* "2319!" moments

Use sparingly.

---

## 33.3 Exploratory

Some information can reveal itself through interaction:

* clicking a statistic reveals its bottles
* relationships appear
* hidden context becomes visible
* bottle history unfolds

Motion should communicate or delight.

Never animate simply because a modern app is expected to animate.

---

# 34. Sound

Sound is optional personality.

No persistent music.

Possible sounds:

* soft click
* paper/tape movement
* satisfying save
* bottle/clink for meaningful interactions
* special milestone sound
* rare "2319!" moment

Settings:

* Sound Effects On/Off
* Volume

Sound should never be required to understand an interaction.

> Rickhouse can have personality without demanding attention.

---

# 35. Loading

Fast operations should feel nearly instant.

Short waits can use:

* physical feedback
* subtle movement
* simple progress

Meaningful waits may include Rick or contextual personality.

Long waits require clear progress/status.

Use skeleton loaders when they communicate the structure more clearly than a character animation.

Never make loading feel like an endless cute animation.

---

# 36. Empty States

Empty states should combine:

1. character
2. visual gag
3. utility

Examples:

### Empty collection

Rick looks confused.

### Empty Group

An unfinished scrapbook page.

### No tasting notes

A blank notebook page.

### No search results

Rick with a magnifying glass.

Always tell the user what they can do next.

---

# 37. Errors

> Tell me what went wrong. Then make me smile.

Every error must communicate:

1. what happened
2. whether anything was saved
3. what the user can do

Serious data errors prioritize clarity.

Personality is secondary.

Never use jokes to obscure a failure.

---

# 38. Destructive Actions

Use the minimum interruption necessary.

### Reversible

Immediate action + Undo.

### Potentially destructive

Confirmation.

### Irreversible / meaningful

Stronger confirmation with contextual explanation.

Do not make users confirm every small action.

Important distinction:

> Removing a bottle from current ownership is not necessarily the same thing as deleting its historical record.

Never use personality to obscure consequences.

---

# 39. Notifications

Notifications may be characterful.

Possible treatment:

* painter's tape
* physical motion
* Rick reaction
* short contextual copy
* optional sound

Example:

> **BOTTLE SAVED**
> Rick has filed the evidence.

Notifications should remain:

* fast
* readable
* non-blocking
* dismissible where appropriate

---

# 40. Onboarding

Show, don't explain.

Onboarding should be brief.

Get the user doing something immediately.

Teach concepts contextually.

Example:

> This is a Label. Think of it as the thing on the shelf.

Later:

> You own three of these. Those are bottles.

Do not force users through a long product tour.

---

# 41. Accessibility

Accessibility is part of the system.

It is not a separate visual mode.

Requirements:

* category colors have redundant indicators
* handwriting has readable equivalents
* sufficient contrast
* meaningful semantic HTML
* keyboard access
* visible focus states
* screen-reader-friendly labels
* reduced motion
* optional sound
* physical interventions never obscure information
* touch targets remain usable
* tables remain navigable

Respect relevant browser/user preferences, including:

```css
@media (prefers-reduced-motion: reduce) {
  /* remove non-essential movement */
}

@media (prefers-contrast: more) {
  /* strengthen contrast and reduce decorative ambiguity */
}
```

Do not allow personality to compromise accessibility.

> Accessibility doesn't remove weirdness. It translates it.

---

# 42. Dark Mode

Light mode is the canonical Rickhouse world.

Dark mode is:

> Rickhouse after sunset.

Do not simply invert colors.

Dark mode should preserve:

* Swiss structure
* category identity
* typography hierarchy
* physical interventions

but alter the atmosphere.

Dark mode should feel deliberate and atmospheric without becoming:

* nightclub UI
* black glass
* neon cyberpunk
* whiskey-bar cliché

---

# 43. Personalization

Rickhouse has a point of view.

Do not build a theme editor.

Initial personalization:

* Light / Dark
* Personality: Quiet / Observant / Nosy / Unhinged
* Sound On / Off
* Reduced Motion
* Accessibility preferences
* Density preferences

Future possibilities:

* curated visual themes
* category palette variations
* more density control
* physicality level

Do not allow arbitrary dashboard construction.

---

# 44. Component Rules

Before creating a component, ask:

### Does this container communicate a real relationship?

If no, don't add it.

### Is the component solving a real interaction problem?

If no, don't add it.

### Could typography or spacing establish the hierarchy instead?

If yes, prefer that.

### Does the component look like something from a generic SaaS template?

If yes, reconsider it.

### Is personality helping the user understand something?

If no, keep it subtle or remove it.

---

# 45. Anti-Patterns

These are explicit **DO NOTs**.

## Never make the application:

* rounded-card soup
* excessive whitespace for aesthetic screenshots
* generic blue/purple SaaS
* Liquid Glass by default
* frosted-glass everything
* gradient-heavy
* glassmorphism-heavy
* "luxury spirits" cliché
* dark wood + fireplace cliché
* generic AI dashboard
* KPI-card soup
* cute mascot everywhere
* scrapbook chaos
* random tape everywhere
* random asymmetry
* quirky font everywhere
* excessive animation
* notification spam
* gamified for no reason
* sterile "premium" software
* overly polished generic mascot
* museum/connoisseur elitist
* fake vintage interface
* fake paper texture everywhere

---

# 46. Specific Component Anti-Patterns

### Do not:

```text
[ rounded card ]
[ rounded card ]
[ rounded card ]
[ rounded card ]
```

just because the design system supports cards.

### Do not:

Use a pill for every:

* category
* status
* filter
* action
* piece of metadata

### Do not:

Put every statistic into:

> BIG NUMBER
> tiny label
> rounded card

### Do not:

Add Rick to every empty space.

### Do not:

Animate every interaction.

### Do not:

Use gradients to make an interface look more "designed."

### Do not:

Turn a data table into a scrapbook.

### Do not:

Make a form slower because it looks more interesting.

### Do not:

Hide important information behind personality.

---

# 47. Interaction Personality by Context

| Context          | Priority                                  |
| ---------------- | ----------------------------------------- |
| Data entry       | Speed → clarity → delight                 |
| Collection table | Data → efficiency → delight               |
| Gallery          | Fun → discovery → data                    |
| Bottle Detail    | Story → context → data                    |
| Home             | Fun → discovery → data                    |
| Numbers          | Curiosity → patterns → analysis           |
| Timeline         | Story → memory → data                     |
| Groups           | Expression → story → structure            |
| Labels           | Reference → clarity → context             |
| Settings         | Clarity → efficiency → almost no bullshit |

This hierarchy should guide decisions when visual priorities conflict.

---

# 48. Transitions Between Experiences

Rickhouse should feel like one world.

When moving between views, shared objects may physically transform.

Examples:

### Collection → Gallery

A small bottle thumbnail grows into the gallery bottle.

### Gallery → Bottle Detail

The bottle becomes the hero object.

### Numbers → Collection

An observation reveals the underlying bottles.

### Numbers → Timeline

A statistic reveals the historical events behind it.

Avoid flashy page transitions.

The goal is:

> continuity, not spectacle.

---

# 49. Data Visualization

Charts should be:

* legible
* editorial
* colorful
* information-first

Category colors may carry into charts.

Avoid:

* dashboard chart clutter
* rainbow charts without meaning
* decorative 3D charts
* unnecessary gradients
* chart junk

A visualization should help answer a question.

Whenever practical:

> Chart → underlying bottles → underlying records.

---

# 50. Implementation Guidance for Claude

When implementing new UI, follow this decision order:

### 1. Understand the information

What does the user need to know or do?

### 2. Establish hierarchy

Use:

* typography
* spacing
* alignment
* grouping

before decorative components.

### 3. Use the grid

Align the experience with the existing layout system.

### 4. Add color

Use color because it has semantic or compositional purpose.

### 5. Add physicality

Ask whether a physical intervention improves the experience.

### 6. Add personality

Only if the context warrants it.

### 7. Add motion

Only when motion communicates continuity, hierarchy, or delight.

### 8. Test density

Do not accidentally make a data-heavy interface sparse.

### 9. Test accessibility

Ensure personality has not compromised usability.

### 10. Remove anything unnecessary

If an element exists only because it "looks cool," question it.

---

# 51. When Claude Is Unsure

Prefer the simpler interpretation.

When two approaches are equally usable:

**Choose the one that feels more collected and less generated.**

When deciding between:

* more decoration vs less → less
* more cards vs fewer → fewer
* more animation vs less → less
* more personality vs less → context-dependent
* more whitespace vs useful density → useful density
* generic component vs physical/editorial treatment → editorial treatment when meaningful
* clever copy vs clear copy → clear copy

---

# 52. Design Review Checklist

Before considering a UI change complete, ask:

### Identity

* Does this feel like Rickhouse?
* Could this be mistaken for generic SaaS?
* Does it feel collected rather than generated?

### Structure

* Is the hierarchy obvious?
* Does the grid make sense?
* Is information density appropriate?

### Personality

* Is the personality contextual?
* Does the data earn the joke?
* Is Rick actually adding something?

### Visual language

* Is color meaningful?
* Is physicality intentional?
* Are typography and spacing doing enough work?
* Are there unnecessary cards, pills, gradients, or shadows?

### Interaction

* Is the action fast?
* Is feedback clear?
* Does motion communicate something?
* Can the user continue working immediately?

### Accessibility

* Can this be understood without color?
* Can it be used with a keyboard?
* Is contrast sufficient?
* Does reduced motion work?
* Does the physical treatment obscure anything?

---

# 53. The Rickhouse Test

Before shipping a new visual treatment, ask:

> **Would this look at home in a beautifully designed field guide belonging to someone who is slightly obsessive about liquor?**

If yes, continue.

If it looks like:

* Apple
* Linear
* Stripe
* Notion
* a fintech app
* a luxury whiskey brand
* a hotel website
* an AI-generated SaaS template

reconsider.

---

# 54. Final Identity

Rickhouse is:

**A Swiss-designed field guide to an eccentric liquor collection.**

Helvetica Now and rigorous grids provide the structure.

Bright category color, real bottle photography, painter's tape, Sharpie annotations, and occasional hand-drawn illustrations make it feel collected rather than manufactured.

The interface is playful and occasionally absurd, but the weirdness is contextual.

**The data earns the joke.**

**Precision underneath. Humanity on top.**

**Curiosity over connoisseurship.**

**Swiss design that has been lived in.**

And above all:

> **Take the collection seriously. Don't take yourself seriously.**
