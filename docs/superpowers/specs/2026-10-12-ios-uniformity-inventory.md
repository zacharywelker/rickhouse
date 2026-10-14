# iOS uniformity inventory (issue #209)

Audit of the iOS screens on `main` at `a76b97e` against `DESIGN.md` section 12.
Found by reading the code; nothing was run on a device, so large-text and
touch-target findings marked **check** still need eyes on a screen. Rule numbers
are the subsections of section 12.

The label screens (`LabelPage`, `LabelEditor`) are being rewritten in #213, #217
and #222. Their rows are listed so the shared pieces cover them, but they move
onto the pieces after those PRs merge (see the order at the end).

## Shared pieces to build

| Piece | Replaces | Rule |
|---|---|---|
| `FactRow` (read and edit) | `EditRow`, `FixedRow`, `fact()` in `LabelPage`, `LabeledContent` in `BottleDetailView` and `TastingFormView`, ad-hoc `HStack`s in `BottleFormView` | 12.1 |
| `DateRow` | `DateEditRow`, the Toggle + `DatePicker` in `BottleFormView`, bare `DatePicker` in `TastingFormView` and `MutedBottlesView` | 12.2 |
| `PickerRow` | `Picker` menus on long lists, the picker rows in `Pickers.swift` | 12.3 |
| `ConfirmSheet` (exists) | every `confirmationDialog` | 12.4 |
| `FootBar` (undo, notice, error) | `UndoBar`, `NoticeBar`, `.alert("Something went wrong")` | 12.5 |
| `SectionLabel` | `SectionTitle`, system `Section("...")` headers, the "About this label" caption, serif section titles | 12.6 |

## By rule

### 12.1 Fact rows

| Where | What it does now |
|---|---|
| `FactEditing.swift` `EditRow` | Dot, put-back, "was ..." under the value. The `$` prefix hides the put-back so the row does not resize. |
| `FactEditing.swift` `FixedRow` | Muted name and value, a reason line under it. |
| `BottleDetailView.swift:311` | `LabeledContent` in a `List`. |
| `LabelPage.swift` `about` / `fact` | Tinted panel (ink at 7%, radius 6), 40 pt rows with drawn hairlines, "Edit" in the panel header. Breaks 12.1 (panel) and 12.7 (radius, and 40 pt rows). |
| `BottleFormView.swift` "More details" | Plain `TextField`s with placeholder text for names, so the name disappears once typed. Price row is hand-built, with the symbol away from the amount until focused. Breaks 12.1. |
| `TastingFormView.swift:102` | `LabeledContent` for "Your bottle"; free-text fields use the section title as the only label. |
| `AccountView.swift` | `Picker`, `NavigationLink`, `Button` rows with system styling. Fine as navigation rows; the currency row breaks 12.3. |

### 12.2 Dates

| Where | What it does now |
|---|---|
| `FactEditing.swift:92` | "Add date" button, then picker and clear. The target behavior. |
| `BottleFormView.swift:74` | `Toggle("Date acquired")` and then a `DatePicker`. Breaks 12.2. |
| `TastingFormView.swift:109` | `DatePicker("Tasted")`, always set to a date. A tasting always has a date, so this one may stay a bare picker; the row should still match in look. |
| `MutedBottlesView.swift:242` | `DatePicker("Muted until")` in a sheet, future dates allowed. Matches the rule's exception. |

### 12.3 Choosing from a list

| Where | What it does now |
|---|---|
| `Pickers.swift` | Sheet with `.searchable`. The target behavior for open sets. |
| `FindLabelView.swift:97` | `.searchable` in a pushed screen. Correct (not a top-level tab). |
| `CollectionView.swift:34`, `LabelsView.swift:70` | In-page `SearchField`. Correct (top-level). |
| `NewLabelView.swift:68` | `BrandSearchField`, a third search field. **check** whether it can use the shared one. |
| `AccountView.swift` Currency | A `Picker` over the whole currency list. Long set, breaks 12.3. |
| `LabelEditor.swift:127,375,473` | `Picker` menus for Category, Base and a third. Short sets except possibly Category. **check** the counts. |
| `TastingFormView.swift:104` | `Picker("Where")`. Short set, fine. |
| `FlavorPicker.swift` | Own screen. Allowed by 12.3. |

### 12.4 Questions

| Where | Now | Change |
|---|---|---|
| `BottleDetailView.swift:74` Discard changes | `confirmationDialog` | `ConfirmSheet` |
| `BottleDetailView.swift:80` Keep open or mark sealed | `confirmationDialog` with two answers | Three-button sheet (12.4) |
| `LabelEditor.swift:56` Discard changes | `confirmationDialog` | `ConfirmSheet` |
| `MutedBottlesView.swift:51` Clear every mute | `confirmationDialog` | `ConfirmSheet` |
| `MergeReview.swift:81` Merge A into B | `confirmationDialog` | `ConfirmSheet` |
| `CollectionView.swift:66`, `LabelPage.swift:765`, `PhotoViewer.swift:76`, `TastingFormView.swift:146` | `confirmSheet` | Already right |
| `FindLabelView.swift:115` Enter the barcode | `alert` with a text field | Already right (text prompt) |

### 12.5 Messages

| Where | Now | Change |
|---|---|---|
| `FactEditing.swift` `UndoBar`, `MergeReview.swift` `NoticeBar` | Two components with the same look and slightly different padding | Merge into `FootBar` |
| `.alert("Something went wrong")` in `CollectionView:75`, `PhotoViewer:77`, `TonightResult:71`; `.alert("Couldn't ...")` in `LabelPage:768`, `TonightFlow:40`, `PhotoAdding:53` | Modal alert | `FootBar` error |
| `ErrorText` (15 files) | Inline in forms | Keep for form errors; check each sits above Save, not between fields |
| `BottleDetailView.swift:78`, `LabelEditor.swift:60` "Nothing you changed has been saved." | Message inside the discard dialog | Becomes the `ConfirmSheet` message |

### 12.6 Section titles

| Where | Now |
|---|---|
| `BottleDetailView.swift:215,254`, `BottleFormView`, `Pickers`, `LogTastingFlow`, `TastingFormView` | System `Section("...")` headers (small caps by default) |
| `FactEditing.swift` `SectionTitle` | System header with an Edit action |
| `LabelPage.swift:259,287,695` | Serif titles ("Flavors you note", "How much is left?"). Breaks 12.6. |
| `LabelPage.swift` "About this label" | Hand-drawn small caps. Matches 12.6 in look but is not shared. |
| `LabelsView.swift:89,105`, `FlavorPicker.swift:259` | More hand-drawn small caps |

### 12.7 Shape, chips, touch, states

| Where | What it does now |
|---|---|
| Radii | 4 and 6 (`LabelPage`), 8 (bars, `FactEditing`), 12 (`ConfirmSheet`). Rule is 8 everywhere except the full-width sheet buttons. Decided: 8 everywhere, so `ConfirmSheet` buttons (12 now) change too. |
| Chips | `AddDetailChips` is a dashed capsule; `LabelPage` has square-cornered (radius 4) chips and `BottleCard`, `FlavorPicker` and `TonightFlow` use capsules. |
| Touch targets | 44 pt frames found in 19 files; `LabelPage` fact rows are 40 pt. **check** every screen with the accessibility inspector. |
| Loading | `ProgressView` in 11 files. Placement is not uniform (overlay vs replacement). **check** |
| Empty and failed | `ContentUnavailableView` in 9 files. Wording style varies ("Couldn't load" vs "Couldn't load this label"). |
| Large text | Not verified anywhere. **check** `EditRow` (name and value side by side) at the largest sizes first. |

## Status

| Piece | State |
|---|---|
| `ConfirmSheet` for every question (12.4) | Done in #230 |
| `FootBar` with Retry for every failure (12.5) | Done in #231 |
| `SectionLabel`, `FactRow`, `DateRow`, `OptionSheet` (12.1, 12.2, 12.3, 12.6) | Built; on the bottle page, Add bottle, Log a tasting, Account (currency) and the pickers |
| Label screens | `LabelPage`'s About panel is rows with hairlines (no tinted box), 44 pt, with the shared section label; the label editor's MSRP uses the account's currency; New Label's headers are shared. New Label's brand field stays an inline type-ahead (12.3 exception) |
| Radius | 8 pt everywhere except photo and thumbnail frames (`CollectionView`, `FindLabelView`, `PhotoThumb`, `LabelThumb`); the label editor's chips are capsules |
| Touch targets | The four 40 pt spots are 44. **check** the other screens with the accessibility inspector |
| Large text (accessibility XL, every screen walked on the Simulator) | Fixed: `EditRow`, `DateRow` and `PickerRow` stack the name above the value (the date row's name had collapsed to single letters; fields truncated their text); the label editor's tick boxes, the fill picker and Tonight's shelf are one column; the + sheet opens full height and wraps; the Add bottle header drops "Change" under the name; the label page's "Latest ..." line wraps; the confirm sheet scrolls. Category became a searchable sheet on `main` (`CategoryPickerSheet`, #240); not walked at large text |
| Contrast | Sign out and Delete this tasting use the app's error red (system red is 3.2:1 on paper) |
| Not checked | VoiceOver on the new bar, rows and sheets; Retry on each failure path other than the Collection delete; Undo on Muted bottles and Tonight; a real phone |
| Price symbol | The bottle page edit row, Add bottle and the label editor's MSRP row use the account's currency symbol instead of a fixed "$" |

## Order of work

1. This PR: the rules and this inventory. No code.
2. Shared pieces (`FootBar`, `SectionLabel`, `FactRow`, `DateRow`, `PickerRow`),
   with unit tests where there is logic, and `confirmationDialog` call sites
   moved onto `ConfirmSheet`. These touch `BottleDetailView`, `MutedBottlesView`
   and `MergeReview` first, which the label PRs do not.
3. Bottle page, Add bottle, Log a tasting, Account.
4. After #213, #217 and #222 merge: `LabelPage`, `LabelEditor`, `NewLabelView`.

## Decided by the owner

- Radius is 8 pt everywhere, including `ConfirmSheet` buttons.
- Every failure shows the error bar with Retry; no alert keeps a bare OK.
