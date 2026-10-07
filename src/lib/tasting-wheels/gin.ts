import type { Wheel } from "./types";

/**
 * The Gin Foundry's botanical flavour wheel, transcribed from an image of the wheel: category names and the
 * botanicals around the rim. The wheel's middle ring of character words (musky, zesty, mellow, and so on) is not
 * used. See CREDITS.md; permission has not been asked yet.
 *
 * The image does not mark which category two words belong to. Nutmeg is read as Rooty (it sits beside angelica) and
 * the four nuts as Nutty; this should be checked against the original before release.
 */
export const ginWheel: Wheel = {
  id: "gin",
  name: "Gin Flavour Wheel",
  credit: "The Gin Foundry, botanical flavour wheel",
  categories: [
    { name: "Heat", groups: [{ name: null, descriptors: ["coriander seed", "ginger", "cubeb berries", "pepper", "grains of paradise"] }] },
    { name: "Spicy", groups: [{ name: null, descriptors: ["anise", "cumin", "saffron", "cardamom", "clove", "cinnamon"] }] },
    { name: "Rooty", groups: [{ name: null, descriptors: ["cassia bark", "orris root", "angelica", "nutmeg"] }] },
    { name: "Nutty", groups: [{ name: null, descriptors: ["chestnut", "walnut", "hazelnut", "almond"] }] },
    { name: "Sweet", groups: [{ name: null, descriptors: ["vanilla", "honeysuckle", "liquorice root", "silver birch sap"] }] },
    { name: "Piney", groups: [{ name: null, descriptors: ["frankincense", "spruce", "juniper", "pine leaves"] }] },
    {
      name: "Herbal",
      groups: [{ name: null, descriptors: ["fennel", "bay laurel", "sage", "rosemary", "thyme", "parsley", "mint", "caraway seed"] }],
    },
    { name: "Grassy", groups: [{ name: null, descriptors: ["lemon grass", "hibiscus", "earl grey"] }] },
    {
      name: "Floral",
      groups: [{ name: null, descriptors: ["marigold", "elderflower", "chamomile", "meadowsweet", "lavender", "violet", "rose"] }],
    },
    { name: "Red fruits", groups: [{ name: null, descriptors: ["cherry", "sloe", "redcurrant", "gooseberries"] }] },
    { name: "Fresh fruity", groups: [{ name: null, descriptors: ["grape", "apple", "cucumber", "melon"] }] },
    { name: "Fleshy fruity", groups: [{ name: null, descriptors: ["peach", "apricot", "mango"] }] },
    { name: "Citrus", groups: [{ name: null, descriptors: ["orange", "grapefruit", "lime", "lemon"] }] },
  ],
};
