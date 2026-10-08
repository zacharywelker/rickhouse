# Rickhouse brand mark

The logo kit. The rules are in `DESIGN.md` section 14; this page says which file to use.

All files are hand-built SVG (generated, not drawn in a design tool), and the wordmark is already converted to outlines, so no font is needed. Have a designer redraw them in a vector tool before print or trademark use.

## Colors
| Token | Hex | Use |
|---|---|---|
| Paper (ivory) | `#FFF8E7` | App light ground; the "white" in the dark logo |
| Ink | `#14213D` | Mark and wordmark on light; the dark logo's ground |
| Orange (Bourbon) | `#FC9350` | Center plank only |

## Which file when
| Need | File |
|---|---|
| Default logo (light) | `lockup-light.svg` |
| Dark surfaces | `lockup-dark.svg` (ivory on ink) |
| App icon (iOS and Android apply their own corner mask) | `app-icon-light-square.svg` (default), `app-icon-dark-square.svg` |
| Header or empty-state mark, transparent | `mark-ink.svg`, `mark-ivory.svg` |
| Connect to or unlock a server (proposed) | `key-dark-square.svg` |
| Roulette, the fully random pick in What to drink tonight: its button and its loading screen, the card spinning (decided) | `pick-card-square.svg` |
| What to drink tonight, the row in the + sheet (open: needs art of its own, now that the card is Roulette's) | none yet; `pick-wheel-square.svg` is available |

The `-square` files are full-bleed 512 x 512 tiles. For a rounded preview, round the corners by 116 on a 512 tile (22.7%).

## Checks
- Every icon's content is centered in its tile to within 0.5 of 512 units (measured from the rendered bounds, including the card's shadow and the wheel's pointer).
- Lockup checked at 180 px wide and the head alone at 32 px; smaller sizes are untested.
- Wordmark: Source Serif 4, weight 600, optical size 36, tracking +0.038 em.

## Rules
- The light logo is the default. The key is used dark.
- No gradients, shadows or extra colors on the mark: only ink, ivory and orange.
- The dark logo's ink ground belongs to the logo. It is not the app's dark-mode palette, which is still undecided.
