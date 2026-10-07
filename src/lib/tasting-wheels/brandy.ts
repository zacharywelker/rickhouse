import type { Wheel } from "./types";

/**
 * The SA Brandy Foundation's "SA Brandy Aroma Wheel", transcribed from an image of the wheel: category names
 * and descriptor words only. It has no middle ring. See CREDITS.md; permission has not been asked yet.
 */
export const brandyWheel: Wheel = {
  id: "brandy",
  name: "Brandy Aroma Wheel",
  credit: "South African Brandy Foundation, SA Brandy Aroma Wheel",
  categories: [
    {
      name: "Woody",
      groups: [
        {
          name: null,
          descriptors: [
            "cedarwood",
            "oakwood",
            "sandalwood",
            "cigar box",
            "humus/oak moss",
            "underwood",
            "tobacco",
            "leather",
            "smoked",
            "pepper",
            "vanilla (wood)",
            "coconut",
          ],
        },
      ],
    },
    { name: "Nutty", groups: [{ name: null, descriptors: ["hazelnut", "walnut", "almond", "coffee", "toasted bread"] }] },
    { name: "Muscat", groups: [{ name: null, descriptors: ["muscat", "raisin"] }] },
    {
      name: "Sweet",
      groups: [{ name: null, descriptors: ["butter", "toffee", "honey", "vanilla (pod)", "caramel", "chocolate", "liquorice"] }],
    },
    {
      name: "Fruity",
      groups: [
        {
          name: null,
          descriptors: [
            "fresh peach",
            "fresh fig",
            "grape",
            "candied fruit",
            "litchi",
            "apple",
            "apricot",
            "banana",
            "plum",
            "passion fruit",
            "mango",
            "pear",
            "citrus",
            "dried peach",
            "dried fig",
            "dried apricot",
            "prune",
          ],
        },
      ],
    },
    {
      name: "Floral",
      groups: [
        {
          name: null,
          descriptors: [
            "wild carnation",
            "honeysuckle",
            "orange blossom",
            "lime blossom",
            "may blossom",
            "violet",
            "acacia",
            "iris",
            "jasmine",
            "lilac",
            "vine flower",
            "rose petals",
          ],
        },
      ],
    },
    { name: "Herbaceous", groups: [{ name: null, descriptors: ["buchu", "grass", "menthol"] }] },
    { name: "Spicy", groups: [{ name: null, descriptors: ["nutmeg", "ginger", "clove", "cinnamon"] }] },
    { name: "Earthy", groups: [{ name: null, descriptors: ["hay", "mushroom", "saffron", "truffle"] }] },
  ],
};
