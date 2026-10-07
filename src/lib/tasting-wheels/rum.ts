import type { Wheel } from "./types";

/**
 * "That Rum Drinker" flavour wheel (Conor, @thatrumdrinker), transcribed from screenshots of its seven tabs.
 * Category, subcategory and descriptor words only. See CREDITS.md; permission has not been asked yet.
 * https://thatrumdrinker.com/using-a-flavour-wheel-when-tasting-rum/
 *
 * Outer slices that carry no label in the screenshots (one in Fruity > Berry, the Perfume group under Floral,
 * two in Rich) are left out rather than guessed. "Lillies" and "Capuccino" are spelled as lilies and cappuccino.
 */
export const rumWheel: Wheel = {
  id: "rum",
  name: "Rum Flavour Wheel",
  credit: "That Rum Drinker (Conor), flavour wheel for rum",
  categories: [
    {
      name: "Fruity",
      groups: [
        { name: "Tropical", descriptors: ["banana", "pineapple", "coconut", "melon", "kiwi", "mango", "passion fruit"] },
        { name: "Citrus", descriptors: ["lemon", "orange", "lime", "grapefruit"] },
        { name: "Berry", descriptors: ["raspberry", "blueberry", "strawberry", "red currant", "cranberry"] },
        { name: "Stone", descriptors: ["peach", "apricot", "plum", "cherry"] },
        { name: "Dried", descriptors: ["raisin", "sultana", "fig", "cranberry"] },
        { name: "Orchard", descriptors: ["apple", "pear"] },
      ],
    },
    {
      name: "Floral",
      groups: [
        { name: "Fragrant", descriptors: ["earl grey", "violet", "hibiscus", "lilies", "lavender"] },
        { name: "Mint", descriptors: ["spearmint", "peppermint"] },
      ],
    },
    {
      name: "Vegetal",
      groups: [
        {
          name: "Leafy",
          descriptors: ["black tea", "green leaves", "nettles", "fresh cut grass", "fresh cane", "eucalyptus", "pine needles", "green tea"],
        },
      ],
    },
    {
      name: "Spicy",
      groups: [
        { name: "Baking", descriptors: ["nutmeg", "cinnamon", "star anise", "clove", "ginger", "cardamom"] },
        { name: "Cooking", descriptors: ["thyme", "rosemary", "basil"] },
        { name: "Peppery", descriptors: ["black pepper", "white pepper"] },
      ],
    },
    {
      name: "Woody",
      groups: [
        { name: "Smoky", descriptors: ["cigar", "smoke", "charcoal", "fire"] },
        { name: "Earthy", descriptors: ["black tea", "leather", "mushrooms", "logs", "moss", "dirt", "hay", "straw"] },
        { name: "Wood", descriptors: ["old furniture", "charred", "sawdust", "cherry", "sandalwood", "cedar", "oak"] },
      ],
    },
    {
      name: "Rich",
      groups: [
        {
          name: "Sweet",
          descriptors: ["fudge", "toffee", "caramel", "butter", "maple syrup", "honey", "liquorice", "vanilla", "treacle", "brown sugar"],
        },
        { name: "Coffee", descriptors: ["cappuccino", "espresso"] },
        { name: "Toasted", descriptors: ["toast", "baked goods"] },
        { name: "Cocoa", descriptors: ["cacao nibs", "white", "milk", "dark"] },
        { name: "Savoury", descriptors: ["mushroom", "brine", "salt", "soy sauce"] },
        { name: "Nutty", descriptors: ["pecan", "cashew", "hazelnut", "walnut", "peanut", "almond"] },
      ],
    },
    {
      name: "Sulphurs",
      groups: [
        { name: "Sulphur", descriptors: ["struck match", "copper penny"] },
        { name: "Rubbery", descriptors: ["tarmac", "new rubber (tyres)", "burnt rubber"] },
        { name: "Solvent", descriptors: ["wood varnish", "nail varnish remover"] },
      ],
    },
  ],
};
