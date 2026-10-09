# Web redesign: design

Status: proposed on 2026-10-08. Nothing here is decided until the owner confirms the rows marked *Proposed*.
Builds on `2026-10-05-design-language-design.md` and `DESIGN.md`, which set the direction. This file decides what that spec left to "the web redesign": the desktop navigation, the desktop entry points for the + actions, whether desktop has a gallery, and what happens to the tape, polaroid, margin-tag, grain and char-stave components. Where this file and the design-language spec disagree on the web, this file is newer.

Dark mode is out of scope (section 8).

## 1. What is already done

| Piece | Where |
| --- | --- |
| Per-category palette matching iOS | `src/lib/bottles/category-palette.ts` |
| Gallery tile: cutouts on a floor, other photos in a mat, "% left" chip, flat shadow | PR 167 (merged) |
| Server cutout flag and `thumbIsCutout` | PR 165 (merged) |
| Desktop gallery view, not the default | `?view=gallery`; the table stays the default, as `DESIGN.md` section 6 says |

So the answer to "does desktop have a gallery view" is yes, as a second view.

## 2. What the web app is today

Measured on `main`, by files that mention each thing:

- **Tokens carry the app.** 47 files use `text-accent` or `bg-accent`, and 124 use the text size scale. Only 2 files use `dark:` and 1 uses `light-dark()` directly, which is `globals.css`. Changing a token re-skins every page, as the comment at the top of `globals.css` says.
- **Two category colour schemes.** The gallery and the table thumbnail use `categoryColor()`, the new 16-colour palette. Seven files, including the table's category dot and the detail pages, still use the old eight-colour field-group tokens (`--category-whiskey` and so on). A rye is green in one place and whiskey orange in another.
- **Old type.** Aileron for everything, and Georgia for the one `font-display` use, on the Numbers page. `DESIGN.md` calls for Inter and Source Serif 4.
- **Old palette.** A grey-warm paper (`#faf8f1`), near-black ink (`#171717`), and the painter's-tape, stave and instant-photo tokens.
- **Decoration.** Tape, polaroid, margin-tag and grain are used in 12 files, mostly the three detail pages. `Tape` rerolls its tilt, torn edge and handwriting font on every mount.
- **Nav.** Home, Collection, Labels, Groups, Numbers and Configuration, as top-level links. Home is a dashboard (a stat strip and the ten latest purchases).

## 3. Decisions

| Question | Proposal | Why |
| --- | --- | --- |
| Type | Inter for all UI, data and numbers (tabular figures). Source Serif 4, display cut, for page titles and the headline line only. Self-hosted with `next/font/local`, like Aileron is now. | `DESIGN.md` section 2. Self-hosting keeps the page free of third-party requests. The iOS app already bundles both, and `CREDITS.md` lists the licence. |
| Surface and ink | Paper `#FFF8E7` and ink `#14213D` replace `--background` and `--foreground`. `--card` is paper too, with a hairline, so cards are not a second surface. `--primary` is ink and `--primary-foreground` is paper. | `DESIGN.md` section 3.1. "Paper and ink" is the whole structure. |
| Secondary text and rules | Muted text `#5B6478`, as on iOS (about 5.6:1 on paper). Borders are ink at about 18%. | Matches iOS. The old `#3a3a3a` muted text was darker than it needed to be. |
| Category colour | One source. Delete the eight `--category-*` tokens and `category-color.ts`. Every caller uses `categoryColor()` or a plate. Swatches become 8 px squares with an ink hairline, as on iOS. | One palette on the web. The round dots are the old direction. |
| Keeping web and iOS palettes equal | A shared fixture of category name and expected hex, checked by a test on each platform. | The two mapping functions are written by hand in two languages and will drift. A fixture catches it for the cost of one file. If Android arrives, move the mapping to the server and send the colour. |
| One bottle frame | Move the gallery's `Frame` into a shared component (`BottlePlate`) used by the gallery, the table thumbnail and the detail pages. | Today three places each draw their own frame. A fourth would be the one that drifts. |
| Tape, polaroid, margin-tag, grain | Retire them. The detail pages show the photo in `BottlePlate`. | `DESIGN.md` section 1: marks are facts, never decoration, tilt at most 2 degrees and never placed by hand. The `alligator!` margin tag is voice written in marker, which section 1 rules out. |
| Marks | The four real marks (open date, gifted-by, store pick, location) show as plain text rows until the marks component exists. | The marker typeface and the tape look are still undecided (design-language section 15). |
| Char level stave | Keep it for now. | It draws real data. It is not decoration. It uses its own wood and char tokens, and the design language does not cover it. Revisit when the detail page is redone. |
| Shadows | Flat offset only, and only on bottle frames. No blurred shadows. | `DESIGN.md` avoids gradients and glass. Eight files use the blurred shadow tokens today. |
| Page titles | Serif for the `h1`. A data-written headline line (design-language section 9) waits for the voice guide. | The serif is for headlines only. |
| Desktop navigation | Collection, Labels, Groups, Numbers, and a user menu with Settings. Configuration moves into the user menu and shows for admins only. | `DESIGN.md` section 7. |
| Home | Keep the route, take it out of the nav, and let the logo link to it. | The page is a useful summary. The design language lists no Home on desktop, but it does not say to delete the page. |
| Desktop + actions | A + button in the header opens a menu of Add a bottle, Log a tasting and What to drink tonight. Only the entries that exist on the web are shown. | It mirrors the raised + on iOS. Today only adding a bottle and Spin the Bottle exist on the web. |
| What Labels is on desktop | Stays the label library for now. | The tasting history that iOS calls Labels belongs to the tasting-log work, and the tab name is still open. |

## 4. Phases

Each phase is its own pull request and can ship alone.

1. **Tokens and type.** Inter and Source Serif 4, the paper and ink tokens, the muted text and border values, the category swatches, and removal of the field-group colour scheme. This is the largest visual change. The pull request carries before and after screenshots of the table, the gallery, a detail page and a form.
2. **Shared bottle frame.** `BottlePlate` in the gallery, the table thumbnail and the three detail pages. Tape, polaroid, margin-tag and grain come out, and the marks become text rows.
3. **Header and navigation.** The nav set, the user menu with Settings, the + menu, and the Home link on the logo.
4. **Table pass.** Done after phase 1, once the table is seen in the new type. Fill column, density and the category dot are decided then, not here.
5. **Forms, admin, auth and Numbers.** The remaining pages and the charts, with category colour joining the chart palette.
6. **Marks component.** Blocked on the marker typeface and tape look.

Dark mode follows in its own spec.

## 5. Risks

- **Text width.** Inter is wider than Aileron, and the table is dense. Check the table at 1280 and 1440 px and the pages at phone width for overflow and clipped cells.
- **Contrast.** Several tokens change at once. Check every text and background pair for 4.5:1, especially placeholders and muted text on table rows.
- **Two identities.** Phase 1 changes the light palette and leaves the dark one alone (section 8).
- **No visual regression tests.** The end-to-end suite checks text and roles, not looks. Each phase relies on screenshots in the pull request and the existing tests.
- **Fonts.** The iOS app has TTF files. The web needs subset WOFF2 files, which is a build step to add.

## 6. Out of scope

Dark mode, the marks component, the voice guide, a central catalog, Android, and the headline copy.

## 7. Open questions for the owner

1. Is keeping the Home page, linked from the logo, right, or should the logo go straight to Collection?
2. Is retiring tape, polaroid, margin-tag and grain right, including the `alligator!` tag?
3. Is a shared fixture enough for the palette, or should the server send the colour?
4. Should the web + menu list only what exists today, or show the missing entries disabled?

## 8. Dark mode

The web app has a working dark mode and a toggle. iOS has none, and the dark palette is undecided. Phase 1 keeps the dark token values as they are. Light will then be the new ivory identity and dark will be the old one, so the toggle will switch between two different looks until the dark spec lands. If that is not acceptable, the alternative is to hide the toggle until then.
