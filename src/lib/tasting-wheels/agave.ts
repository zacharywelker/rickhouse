import type { Wheel } from "./types";

/**
 * The Academia Patron tequila flavor wheel, transcribed from an image of the wheel: category, subcategory and
 * descriptor words only. See CREDITS.md; permission has not been asked yet.
 *
 * The image is a small, rotated chart; the grouping of descriptors under subcategories is read from their
 * position and should be checked against the original before release.
 */
export const agaveWheel: Wheel = {
  id: "agave",
  name: "Tequila Flavor Wheel",
  credit: "Academia Patron, tequila flavor wheel",
  categories: [
    {
      name: "Flowers",
      groups: [
        { name: "White", descriptors: ["jasmine", "orange blossom"] },
        { name: "Purple", descriptors: ["lavender", "lilac", "rose"] },
        { name: "Yellow", descriptors: ["marigold", "damiana", "lemongrass"] },
      ],
    },
    {
      name: "Plants",
      groups: [
        { name: "Herbal", descriptors: ["dill", "chamomile", "grass", "mint", "aloe", "asparagus"] },
        { name: "Green", descriptors: ["bean", "basil", "bell pepper", "jalapeño", "thyme", "oregano", "rosemary", "sage"] },
        { name: "Savory", descriptors: ["tobacco", "black tea", "corn", "sweet potato", "cooked agave"] },
      ],
    },
    {
      name: "Earth",
      groups: [
        { name: "Peppery", descriptors: ["white pepper", "black pepper"] },
        { name: "Minerally", descriptors: ["limestone", "wet cement"] },
        { name: "Musty", descriptors: ["mushroom", "olive", "yeast", "wet earth", "wet leaves"] },
      ],
    },
    {
      name: "Wood",
      groups: [
        { name: "Fresh", descriptors: ["cedar", "pine tree", "oak (fresh)", "wood shavings", "wood bark"] },
        { name: "Burnt", descriptors: ["leather", "oak (charred)", "charcoal", "smoke"] },
      ],
    },
    {
      name: "Spice",
      groups: [
        { name: "Baking", descriptors: ["nutmeg", "allspice", "cinnamon", "clove", "ginger"] },
        { name: "Medicinal", descriptors: ["anise", "licorice"] },
      ],
    },
    {
      name: "Dessert",
      groups: [
        { name: "Chocolate", descriptors: ["cola", "molasses", "coffee beans", "chocolate", "cocoa"] },
        { name: "Gooey", descriptors: ["toffee", "dulce de leche", "caramel", "honey", "vanilla bean"] },
        { name: "Nutty", descriptors: ["walnut", "hazelnut", "almond"] },
      ],
    },
    {
      name: "Fruit",
      groups: [
        { name: "Tropical", descriptors: ["pineapple", "melon", "banana", "coconut"] },
        { name: "Stone", descriptors: ["cherry", "peach", "plum"] },
        { name: "Orchard", descriptors: ["apple", "pear", "cider"] },
        { name: "Citrus", descriptors: ["lemon", "grapefruit", "lime", "orange"] },
      ],
    },
    {
      name: "Chemical",
      groups: [
        {
          name: "Artificial",
          descriptors: [
            "banana flavoring",
            "cream soda",
            "sweetener",
            "bubble gum",
            "almond flavoring",
            "cherry flavoring",
            "vanilla flavoring",
          ],
        },
        { name: "Solventy", descriptors: ["rubber", "plastic", "alcohol", "acetone"] },
      ],
    },
  ],
};
