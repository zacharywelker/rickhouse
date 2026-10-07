import type { Wheel } from "./types";

/**
 * The Council of Whiskey Masters' Whisky Flavor Wheel: category, subcategory and descriptor words only.
 * See CREDITS.md. https://www.whiskeymasters.org/whisky-tasting-wheel
 */
export const whiskyWheel: Wheel = {
  id: "whisky",
  name: "Whisky Flavor Wheel",
  credit: "The Council of Whiskey Masters, Whisky Tasting Wheel",
  categories: [
    {
      name: "Cereal",
      groups: [
        { name: "Cooked mash", descriptors: ["porridge", "bran", "mash tun draff", "cooked", "potato skins"] },
        { name: "Cooked vegetable", descriptors: ["mashed potato", "boiled corn", "baked potato"] },
        { name: "Husky", descriptors: ["dried hops", "mousey", "ale", "iron tonic"] },
        { name: "Malt extract", descriptors: ["malted milk", "cattle", "cake"] },
        { name: "Yeasty", descriptors: ["boiled pork", "sausage", "gravy", "meaty"] },
      ],
    },
    {
      name: "Fruity",
      groups: [
        { name: "Citric", descriptors: ["oranges", "tangerine", "zest", "kiwi", "nectarines", "lemon"] },
        { name: "Fresh fruit", descriptors: ["apples", "pears", "peaches", "apricot", "fruit salad"] },
        { name: "Cooked fruit", descriptors: ["stewed apple", "marmalade", "jam", "candied fruits", "barley sugar"] },
        { name: "Dried fruit", descriptors: ["raisins", "figs", "prunes", "fruit cake", "mince pies"] },
        { name: "Solvent", descriptors: ["nail varnish remover", "bubble gum", "paint", "soda", "pine essence"] },
      ],
    },
    {
      name: "Floral",
      groups: [
        { name: "Fragrant", descriptors: ["perfume", "fabric softener", "barber's shop", "coconut", "lavender"] },
        { name: "Green house", descriptors: ["geraniums", "green tomatoes", "florist's shop"] },
        { name: "Leafy", descriptors: ["green leaves", "lawn clippings", "pea pods", "fir", "pine nuts"] },
        { name: "Hay", descriptors: ["mown hay", "dry hay", "barns", "heather", "herbal", "sage", "mulch"] },
      ],
    },
    {
      name: "Peaty",
      groups: [
        { name: "Medicinal", descriptors: ["iodine", "carbolic", "hospitals", "lint", "tar", "diesel oil", "sea-weed"] },
        { name: "Smokey", descriptors: ["bonfire", "burnt sticks", "incense", "peat reek"] },
        { name: "Kippery", descriptors: ["sea shells", "dried shellfish", "oysters", "smoked salmon", "anchovies"] },
        { name: "Mossy", descriptors: ["moss water", "birchy", "earthy", "turf", "hemp rope", "fishing nets"] },
      ],
    },
    {
      name: "Feinty",
      groups: [
        { name: "Honey", descriptors: ["clover honey", "heather honey", "mead", "beeswax", "polish"] },
        { name: "Leathery", descriptors: ["leather upholstery", "libraries", "new cowhide", "biscuits"] },
        { name: "Sweat and plastic", descriptors: ["buttermilk", "cheese", "yeast", "shoe polish", "old gym shoes", "plastic rope"] },
        { name: "Tobacco", descriptors: ["dried tea", "fresh tobacco", "tobacco ash"] },
      ],
    },
    {
      name: "Sulphury",
      groups: [
        { name: "Coal gas", descriptors: ["spent fireworks", "burnt matches", "matchbox"] },
        { name: "Rubbery", descriptors: ["pencil eraser", "new tires", "electric cables", "burnt rubber"] },
        { name: "Sandy", descriptors: ["fresh laundry", "starch", "linen", "beach", "sulphur"] },
        { name: "Vegetative", descriptors: ["brackish", "cabbage water", "turnips", "stagnant", "marsh gas"] },
      ],
    },
    {
      name: "Woody",
      groups: [
        { name: "Toasted", descriptors: ["rice pudding", "burnt toast", "coffee grounds", "fennel", "liquorice"] },
        { name: "Vanilla", descriptors: ["custard", "crème caramel", "sponge", "madeira cake", "toffee"] },
        { name: "Old wood", descriptors: ["musty", "cardboard", "cellars", "pencils", "cork", "ink", "metallic"] },
        { name: "New wood", descriptors: ["resinous", "cigar box", "sandalwood", "cedar", "ginger", "pepper", "nutmeg"] },
      ],
    },
    {
      name: "Winey",
      groups: [
        { name: "Sherried", descriptors: ["white or red wine", "sauternes", "fino", "oloroso", "armagnac", "madeira", "port"] },
        { name: "Nutty", descriptors: ["walnuts", "hazel nuts", "praline", "almonds", "marzipan"] },
        { name: "Chocolate", descriptors: ["cream", "butter", "milk chocolate", "cocoa", "bitter chocolate"] },
        { name: "Oily", descriptors: ["linseed oil", "candlewax", "suntan oil", "olive oil"] },
      ],
    },
  ],
};
