# Adding a label: one flow on web and iOS (#202)

Status: approved design, 2026-10-11. Implementation plan to follow.

## Goal

Adding a label works the same way on both apps: find first, create the basics, add specs if you want, save. The phone stays quick enough to use at a store shelf; the web keeps its full form.

Success:
- No free-text brands anywhere. Brand is picked from existing brands or added deliberately.
- Same required fields on both apps: brand, name, category. Barcode and photo optional.
- Same order of steps on both apps.
- A label can be created with a photo on both apps, and the photo goes through the cutout pipeline.

## Shared flow

1. **Find.** Search box; matching labels list as you type. The last row is always **Create new label**, carrying the typed text in as the name. iOS also scans a barcode (unchanged).
   - Web: picking a result opens that label's edit page.
   - iOS: picking a result returns to the flow that started it (add a bottle, log a tasting).
2. **Create, the basics.** Brand (searchable picker with "Add new brand"), name, category, barcode, optional photo.
3. **Specs, optional.** Web: the existing full form below the basics. iOS: a collapsed **More details** section.
4. **Save.**
   - An exact duplicate (same brand and name) offers "You already have this label: use it". iOS does this today; web matches it.
   - Then the held photo is posted to the existing label photo route, which does the cutout.
   - If the label saves but the photo fails, the label stays. The user sees "Photo didn't upload, retry". No rollback.

## Web

- `/expressions/new` opens on a search step that reuses `label-search-box.tsx`. "Create new label" switches the same page to `ExpressionForm` with `name` prefilled. No new route; browser back returns to the search.
- `ExpressionForm` gains a Photo block at the top of Identity: upload a file or paste a link. It is held client-side until save, then posted to `POST /api/expressions/[id]/photo` (which already accepts `photo` or `imageUrl` and cuts out).
- On photo failure the user lands on the new label's page with the error beside `LabelPhotoControls`.
- "Save + add bottle" waits for the photo upload before redirecting. Accepted.
- **Separate bug, first PR:** a photo from a link fails on the new-bottle page. Reproduce in the browser before fixing; land on its own.

## iOS

`NewLabelView` field order: Brand, Name, Category, Barcode, Photo, More details (collapsed). Save in the toolbar.

- **Brand:** an inline search field, not a sheet. Matches list below as you type, ending with "Add new brand '<typed>'". Picking one fills the field with a tick; tapping it reopens the search. The search and find-or-create logic is pulled out of `PickerSheet` (`Pickers.swift`) into a shared model used by both the sheet and the inline field. Find-or-create returns the existing brand on a name match, so no near-duplicates.
- **Photo:** **Take photo** / **Choose from library**, reusing the bottle photo capture (resize, GPS strip). Held until save, then sent to `POST /api/v1/expressions/[id]/photo`. On failure, the user still returns to the calling flow, with a retry banner.
- **More details:** built from the #177 field views in `FactEditing.swift`, so each field is defined once. `POST /api/v1/expressions` accepts only brand, name, categoryId and upc, so specs are saved by the #195 PATCH right after create. If the PATCH fails, the label stays and the user sees which facts didn't save.
- **Barcode:** prefilled from the scan, as today.
- **Duplicate with a held photo:** "Use existing" drops the photo, unless the existing label has no photo; then offer "Use this photo too". Never overwrite an existing photo silently.

## Server

No new endpoints. Existing: `POST /api/v1/expressions`, `/api/v1/expressions/[id]/photo`, the #195 PATCH, and the lookup and find-or-create routes.

## Order of work (one PR each)

1. Fix: photo link on the new-bottle page.
2. Web: search-first `/expressions/new` and a photo on the create form.
3. iOS: inline brand search field (with the `PickerSheet` refactor).
4. iOS: label photo on create.
5. iOS: More details, after the #177 PRs (#195, #197, #207) land.

## Testing

- Web: Playwright e2e for search, then create with an uploaded photo; search, then pick an existing label; and the duplicate path. A unit test for the held-photo submit.
- iOS: unit test for the shared brand search model, covering match, create, and an existing name returning the same brand. Simulator check of the full create with a photo. A device check of the camera.
- Bug fix: a failing test that reproduces the link failure before the fix.

## Out of scope

- Changing the web full form's fields.
- Background photo upload.
- Barcode prefilling anything besides the barcode field.
