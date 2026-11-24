# Add bottle redesign: mockups

Throwaway design mockups for [`../2026-11-23-add-bottle-redesign-design.md`](../2026-11-23-add-bottle-redesign-design.md). They are plain HTML with no build step and no dependencies. They are **not the app**, and nothing here is wired to the real forms.

- `form-by-category.html`: a clickable prototype. Pick a category and subcategory and the form redraws with only the fields the spec allows. The typed behaviours work: an age sets the tequila or mezcal class and the Cognac, Armagnac or Calvados designation, grapes make a Peruvian pisco an Acholado, an ABV sets the Chilean pisco class, and the Calvados fruit table totals and warns.
- `data-sheet.html`: the chosen layout for a new label of a bourbon, drawn at 864px (a half-screen).
- `screenshots/`: stills of both, so they read on GitHub.

Open the HTML files directly in a browser. Fonts fall back to system fonts if Inter and Source Serif 4 are not installed. The values are examples, and the category colours are placeholders.
