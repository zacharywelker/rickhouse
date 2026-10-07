import type { Wheel } from "./types";

/**
 * The Council of Whiskey Masters' official Bourbon Flavor Wheel: category names, subcategory names and
 * descriptor words only (their explanatory text is not copied). See CREDITS.md.
 * https://www.whiskeymasters.org/bourbon-tasting-flavor-wheel
 *
 * Source typos are corrected ("white lilly"). Where a bare word only makes sense with its group, the group word is
 * added (black/green/oolong under Tea, milk/dark/white under Chocolate, ground/brewed/burnt under Coffee, and
 * artificial under Sweetener). Where the source merges several labels into one subcategory
 * ("Wet/Dry, Fresh/Old, Toasted/Charred", "Fresh, Roasted, Shells, Butter/Spread", "Corn, Rye, Wheat, Barley, Mash")
 * the group is given a plain name.
 */
export const bourbonWheel: Wheel = {
  id: "bourbon",
  name: "Bourbon Flavor Wheel",
  credit: "The Council of Whiskey Masters, official Bourbon Flavor Wheel",
  categories: [
    {
      name: "Herbal",
      groups: [
        { name: "Fresh", descriptors: ["dill", "tarragon", "eucalyptus"] },
        { name: "Minty", descriptors: ["mint", "peppermint", "spearmint", "wintergreen"] },
        { name: "Anise", descriptors: ["star anise", "licorice", "fennel"] },
        { name: "Bitter", descriptors: ["cough syrup", "turpentine"] },
        { name: "Tea", descriptors: ["black tea", "green tea", "oolong tea"] },
        { name: "Dried", descriptors: ["dried herbs", "incense"] },
      ],
    },
    {
      name: "Spicy",
      groups: [
        { name: "Baking", descriptors: ["cinnamon", "clove", "nutmeg", "ginger", "cardamom"] },
        { name: "Savory", descriptors: ["coriander", "caraway"] },
        { name: "Piquant", descriptors: ["pepper", "allspice"] },
      ],
    },
    {
      name: "Floral",
      groups: [
        { name: "Fresh", descriptors: ["rose", "lavender", "white lily"] },
        { name: "Compound", descriptors: ["perfume", "florist shop", "wildflowers"] },
        { name: "Dried", descriptors: ["dead flowers", "potpourri"] },
      ],
    },
    {
      name: "Fruity",
      groups: [
        { name: "Citrus", descriptors: ["lemon", "orange", "pomelo", "tangerine", "grapefruit", "lime"] },
        { name: "Stone", descriptors: ["cherry", "plum", "peach", "apricot", "nectarine"] },
        { name: "Orchard", descriptors: ["apple", "pear", "fig", "grape"] },
        { name: "Tropical", descriptors: ["banana", "coconut", "lychee", "guava", "mango", "pineapple", "papaya"] },
        { name: "Melon", descriptors: ["watermelon", "honeydew"] },
        { name: "Berry", descriptors: ["blackberry", "blueberry", "raspberry", "cranberry", "strawberry"] },
        { name: "Processed", descriptors: ["zest", "peel", "pith", "rind", "concentrated", "artificial"] },
        { name: "Dried or dehydrated", descriptors: ["raisin", "date", "dried fig", "prune", "dried apricot", "dehydrated fruit"] },
        { name: "Cooked", descriptors: ["jam", "marmalade", "cobbler", "stewed fruit"] },
      ],
    },
    {
      name: "Finished",
      groups: [
        { name: "Ex-dry wine", descriptors: ["red wine", "white wine"] },
        { name: "Ex-sweet wine", descriptors: ["Sauternes", "Vin Santo", "Tokaji"] },
        { name: "Ex-fortified wine", descriptors: ["Sherry", "Port", "Madeira", "Marsala"] },
        { name: "Ex-spirit", descriptors: ["rum", "brandy", "Tequila"] },
      ],
    },
    {
      name: "Aged",
      groups: [
        { name: "Funky", descriptors: ["leather", "old library", "dust", "wood polish", "mushroom"] },
        { name: "Oxidative", descriptors: ["rancio", "varnish", "molasses"] },
      ],
    },
    {
      name: "Flawed",
      groups: [
        { name: "Sulfurous", descriptors: ["struck match", "cabbage", "egg"] },
        { name: "Fungal or bacterial", descriptors: ["mold", "cardboard", "wet dog", "yogurt", "cheese", "vinegar"] },
        { name: "Burnt mash", descriptors: ["bitter", "charred grain"] },
        { name: "Over-extracted wood", descriptors: ["acrid", "bitter", "astringent", "murky", "flocculated"] },
        { name: "Ethereal", descriptors: ["acetone", "lacquer", "solvent"] },
      ],
    },
    {
      name: "Industrial",
      groups: [
        { name: "Waxy", descriptors: ["candle", "lanolin", "beeswax"] },
        { name: "Rubbery", descriptors: ["new tire", "garden hose"] },
        { name: "Chemical", descriptors: ["marker", "new carpet", "paint"] },
      ],
    },
    {
      name: "Primary tastes",
      groups: [{ name: null, descriptors: ["sweet", "sour", "salty", "bitter", "umami"] }],
    },
    {
      name: "Textural aspects",
      groups: [
        { name: "Full-bodied", descriptors: ["heavy", "rich", "viscous", "syrupy", "oily", "slow-moving", "supple"] },
        { name: "Light-bodied", descriptors: ["light", "watery", "elegant", "thin", "nimble", "delicate"] },
        {
          name: "Warming or cooling",
          descriptors: ["nose-warming", "nose-cooling", "mouth-warming", "mouth-cooling", "mild", "approachable", "prickly", "unbalanced", "hot", "fiery"],
        },
        { name: "Tannic", descriptors: ["grippy", "drying", "angular", "hard", "chewy", "velvety"] },
        { name: "Mineral", descriptors: ["chalky", "flinty", "graphite", "hard water", "vitamins"] },
      ],
    },
    {
      name: "Woody",
      groups: [
        { name: "Baked", descriptors: ["crème brûlée", "pastry", "graham cracker"] },
        { name: "Soda", descriptors: ["cola", "Dr Pepper"] },
        {
          name: "Wood",
          descriptors: ["oak", "maple", "cedar", "balsa", "sandalwood", "mahogany", "hickory", "pencil shavings", "charcoal", "campfire"],
        },
      ],
    },
    {
      name: "Sweet",
      groups: [
        { name: "Sweetener", descriptors: ["brown sugar", "white sugar", "burnt sugar", "maple syrup", "honey", "artificial sweetener"] },
        { name: "Confectionary", descriptors: ["caramel", "butterscotch", "toffee", "vanilla", "nougat", "bubblegum", "marshmallow"] },
        { name: "Chocolate", descriptors: ["milk chocolate", "dark chocolate", "white chocolate", "baker's chocolate", "fudge", "cacao"] },
      ],
    },
    {
      name: "Lactic",
      groups: [{ name: "Dairy", descriptors: ["popcorn butter", "cream"] }],
    },
    {
      name: "Nutty",
      groups: [
        { name: "Nuts", descriptors: ["peanut", "almond", "hazelnut", "chestnut", "walnut", "pecan", "cashew", "marzipan"] },
      ],
    },
    {
      name: "Grainy",
      groups: [
        { name: "Grain", descriptors: ["corn bread", "popcorn", "rye bread", "wheat bread", "malted barley", "cereal", "biscuit", "yeast", "ale"] },
      ],
    },
    {
      name: "Earthy",
      groups: [
        { name: "Coffee", descriptors: ["ground coffee", "brewed coffee", "burnt coffee"] },
        { name: "Tobacco", descriptors: ["cigar", "pipe", "cigarette"] },
        { name: "Geosmin", descriptors: ["rain", "wet concrete"] },
        { name: "Musty", descriptors: ["cellar", "barnyard", "rickhouse"] },
        { name: "Vegetation", descriptors: ["foliage", "lawn clippings", "dry grass", "dry leaves"] },
      ],
    },
  ],
};
