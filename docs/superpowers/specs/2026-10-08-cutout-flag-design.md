# Cutout flag: design

Status: proposed on 2026-10-08. Step 1 of section 7 (migration, upload code, API field, tests) is built; the backfill and both clients are not.
Builds on section 8 of `2026-10-05-design-language-design.md` (photography and the plate). Where this file and that one disagree, this file is newer.

## 1. Why

The bottle card draws a plate (a wall, a floor, the bottle standing on it) only when the photo is a cutout. A photo that still has its background shows in the plain frame instead. Today no client can tell the two apart: the server keeps no record, and the iOS and web cards draw every photo as if it were a cutout. In-app capture keeps the background, so plain photos are about to become the common case.

Both the iOS app and the web app need the answer, so the server decides it once, at upload, and sends it.

## 2. What is decided

| Question | Decision |
| --- | --- |
| Who decides? | The server, once, when it stores the photo. Clients never inspect pixels. |
| What counts as a cutout? | The photo has an alpha channel and at least 2% of its pixels are transparent (alpha at or below 8, the same threshold the trim already uses). A PNG with an unused alpha channel is a plain photo. |
| Measured on what? | The oriented image before the transparent margins are cropped, in the same pass that finds the crop box. |
| Where is it stored? | A nullable boolean beside each stored photo path, in the three places a photo lives: `bottle_images`, `expression_releases` and `expressions`. |
| What does null mean? | Unknown, or no photo. Clients treat null as a cutout, which is how every photo is drawn today, so nothing regresses before the backfill runs. |
| How do clients get it? | `bottle_list` gains `thumb_is_cutout`, and the API sends `thumbIsCutout` next to `thumbPath`. |

## 3. Data model

One migration, written by hand, with its journal entry.

- `bottle_images.is_cutout`, `expression_releases.photo_is_cutout` and `expressions.photo_is_cutout`: `boolean`, nullable, no default.
- The flag must be nullable, not `false` by default. The view picks a photo by taking the first of the bottle's own, the release's, then the label's. A default of `false` on a release with no photo would win that comparison and hide the label's flag. Null is skipped, so the flag follows the same photo as the path.
- `bottle_list` gains `thumb_is_cutout` as its last column, so the view is replaced in place. It follows the same source as `thumb_path` (the bottle's primary image, then the release, then the label) with a `CASE` on which source supplies the path. It must not `COALESCE` the three flags: a bottle photo whose flag is still unknown would then borrow the label photo's flag.
- Removing a photo sets its flag back to null along with its paths.

## 4. Where it is computed

`transparentCropBox` in `src/lib/trim-transparent.ts` already walks every alpha value. It also counts the transparent ones and returns the count with the box, so there is no second pass. `storeImageBytes` in `src/lib/images.ts` returns `isCutout` on `StoredImage`. Each caller that writes a photo path writes the flag with it: the bottle image routes, the label photo route, the release photo route and the COLA copy.

COLA label art skips the analysis and reports `isCutout: false`, since a label scan is never a cutout and a 6000px walk is not free. Group covers go through the photo path and get a flag nobody reads.

## 5. Backfill

A script in `scripts/` reads each stored photo that has a path and no flag, runs the same alpha count, and writes the result. It is safe to run twice and to stop part way. Stored files are already trimmed, so the transparent share is smaller than at upload. A cutout that is almost a perfect rectangle could fall under 2% and be drawn as a plain photo. The script prints each photo it marks as not a cutout so they can be checked by eye before the clients switch over.

## 6. Clients

- **iOS.** `BottleSummary` gains `thumbIsCutout: Bool?`. The card draws the plate when it is true or null, and the framed photo when it is false. The framed photo fills the same 3:4 space inside the category mat, with no floor.
- **Web.** The gallery tile uses the same rule, rendered on the server. The phone card list can use it later.
- An older server sends no field, so both clients must accept a missing key.

## 7. Rollout

1. Migration, upload code, API field and tests. No client changes.
2. Backfill, then check the printed list.
3. iOS reads the field and draws the framed fallback.
4. The web gallery reads it.

Step 1 changes nothing visible, so it can ship alone.

## 8. Tests

- The alpha count: an opaque JPEG, a PNG with an unused alpha channel, a transparent bottle shape, a tight rectangular bottle and a fully transparent image. The first two and the last are not cutouts; the other two are.
- Each write path stores the flag and clears it on removal.
- The view returns the flag of the same photo it returns the path for, including when the release has no photo and the label does.

## 9. Open

- Whether 2% is right. It is a guess until it runs over the real collection in step 2.
- Whether the web and iOS apps should also share one category color source. They mirror each other by hand today. That is separate from this flag.
