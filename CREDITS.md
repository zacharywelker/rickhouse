# Credits and sources

A working list of the outside work Rickhouse refers to or uses, so that proper credit and permission can be sorted
out **before a v1 release**. Add to it whenever something outside the project is used, even loosely.

Nobody has been contacted yet. "Permission" below means the project owner's record of asking and the answer; until
a row says otherwise, none has been asked for.

## Flavor wheels (the tasting log)

The tasting log's tags are the descriptors of one published flavor wheel per spirit family (see
`docs/superpowers/specs/2026-10-06-tasting-log-design.md`). Plan: use only category names and descriptor words,
credit the source visibly in the app, and never copy a source's explanatory text or artwork.

| Used for | Source | Owner | How we have it | Permission | Needed before v1 |
| --- | --- | --- | --- | --- | --- |
| Bourbon, rye and American whiskey | [Official Bourbon Flavor Wheel](https://www.whiskeymasters.org/bourbon-tasting-flavor-wheel) | The Council of Whiskey Masters (Sommelier Capital Advisors LLC), "All rights reserved"; made by Adam Edmonsond, Carmen Hartwich, Kevin Malta, Tom McCormick and Justin Strumpfer under advice of Steve Beal | Read from the public page (2026-10-06) | Not asked | Ask the Council (office@whiskeymasters.org); agree wording of the credit line |
| Scotch, Irish and other whisk(e)y | [Council Whisky Tasting Wheel](https://www.whiskeymasters.org/whisky-tasting-wheel) | The Council of Whiskey Masters | Read from the public page (2026-10-06) | Not asked | Same request as above |
| Gin | Gin Foundry botanical flavour wheel (also in their book *Gin: Distilled*) | The Gin Foundry | An image of the wheel supplied by the project owner (2026-10-06); original link not recorded | Not asked | Record where the wheel was found; ask the Gin Foundry |
| Rum | [Using a flavour wheel when tasting Rum](https://thatrumdrinker.com/using-a-flavour-wheel-when-tasting-rum/) (an interactive chart) | Conor, That Rum Drinker (@thatrumdrinker); (c) 2025 That Rum Drinker, all rights reserved | Screenshots of all seven tabs (Fruity, Floral, Vegetal, Spicy, Woody, Rich, Sulphurs) supplied by the project owner (2026-10-06). A few outer slices carry no label in the screenshots | Not asked | This is one person's personal wheel: ask the author before using it, and ask whether the unlabeled slices are meant to be empty |
| Agave (tequila, mezcal) | Academia Patron tequila flavor wheel (a PDF on Google Drive) | Patron Spirits (to confirm) | An image of the wheel supplied by the project owner (2026-10-06); the Drive PDF itself was not opened. Which subcategory each descriptor sits under is read from its position on a small rotated chart | Not asked | Check the grouping against the original; confirm the owner; ask |
| Brandy | [SA Brandy Foundation aroma wheels](https://sabrandy.co.za/wp-content/uploads/2025/08/Aroma-Food-Wheels_Final-1.pdf) (PDF; the "SA Brandy Aroma Wheel") | South African Brandy Foundation | An image of the aroma wheel supplied by the project owner (2026-10-06); the PDF itself could not be rendered on the build machine, so any other wheels in it are unread | Not asked | Read the rest of the PDF; ask |
| Vodka, liqueur, other | None chosen. To do: a generic list of tasting notes for these families | | | | Choose a source for a generic list, or write one and say so |

## Other references

| What | Source | Note |
| --- | --- | --- |
| Torch freezing VisionKit's scanner, and the fix of choosing the camera through a discovery session | Apple Developer Forums: "DataScannerViewController freezes when enabling torch using AVCaptureDevice" (thread 817977) | Read only as a search summary (the forum blocked automated reading). Credit the thread in the code comment, as is done in `ios/Rickhouse/BarcodeScanner.swift` |
| Typefaces Inter and Source Serif 4 | SIL Open Font License; licence texts sit beside the fonts in `ios/Rickhouse/Fonts/` | Already bundled unmodified |
| Category color references | Pantone references named in `DESIGN.md` | Confirm whether naming Pantone needs a credit or a trademark note |
| SF Symbols in the iOS app | Apple | The design spec notes SF Symbols are licensed for Apple platforms only; the owner is to confirm against Apple's current license |

## Before v1: checklist

- [ ] Ask each wheel owner above for permission, and record the answer in the table.
- [ ] Decide the credit line for each wheel and where it shows in the app (a screen in Account is the likely place).
- [ ] Replace any source that says no.
- [ ] Re-read every row's "Needed before v1" and clear it.
