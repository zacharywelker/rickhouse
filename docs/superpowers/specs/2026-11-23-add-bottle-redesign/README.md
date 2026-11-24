# Add bottle redesign: mockups

Throwaway design mockups for [`../2026-11-23-add-bottle-redesign-design.md`](../2026-11-23-add-bottle-redesign-design.md). They are plain HTML with no build step and no dependencies. They are **not the app**, and nothing here is wired to the real forms.

- `form-by-category.html`: a clickable prototype. Pick a category and subcategory and the form redraws with only the fields the spec allows. The typed behaviours work: an age sets the tequila or mezcal class and the Cognac, Armagnac or Calvados designation, grapes make a Peruvian pisco an Acholado, an ABV sets the Chilean pisco class, and the Calvados fruit table totals and warns.
- `data-sheet.html`: the chosen layout for a new label of a bourbon, drawn at 864px (a half-screen).
- `screenshots/`: stills of both, so they read on GitHub.

Open the HTML files directly in a browser. Fonts fall back to system fonts if Inter and Source Serif 4 are not installed. The values are examples, and the category colours are placeholders.

Photos (section 11 of the design record):

- `photo-flow.html`: a clickable prototype of the photo slot on the add page, a bottle's Photos section (drag to reorder, hide, remembered order, a vintage selector), and a label's gallery. Paste a link (any text with a dot; one with "bad" or "page" shows a warning), choose or drop a file, and right-click any photo. The right-click Paste item needs the page to be on HTTPS; the page says so when it is not.

Popups (section 16 of the design record):

- `mashbill-popup.html`, `distillery-popup.html`, `finish-popup.html`: clickable prototypes of the three popups, each with the form behind it. The demo bar at the top of each changes the spirit (and, for finish, the number of mashbills).
- `screenshots/23` to `25`: stills of the three popups.

The popups are built (see section 16 of the design record, "As built" notes). Where the build differs from these mockups (for example the distillery's identifier follows the country, not the spirit), the design record is the newer source.
