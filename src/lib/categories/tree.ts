import type { FieldGroup } from "@/db/schema";

export type CategoryNode = {
  name: string;
  slug: string;
  parent: string | null;
  fieldGroup: FieldGroup;
  sortOrder: number;
};

export const CATEGORY_TREE: readonly CategoryNode[] = [
  { name: "American Whiskey", slug: "american-whiskey", parent: null, fieldGroup: "whiskey", sortOrder: 1 },
  { name: "Irish Whiskey", slug: "irish-whiskey", parent: null, fieldGroup: "whiskey", sortOrder: 2 },
  { name: "Scotch Whisky", slug: "scotch", parent: null, fieldGroup: "whiskey", sortOrder: 3 },
  { name: "Whisky", slug: "whiskey", parent: null, fieldGroup: "whiskey", sortOrder: 4 },
  { name: "Rum", slug: "rum", parent: null, fieldGroup: "rum", sortOrder: 5 },
  { name: "Agave", slug: "agave", parent: null, fieldGroup: "agave", sortOrder: 6 },
  { name: "Brandy", slug: "brandy", parent: null, fieldGroup: "brandy", sortOrder: 7 },
  { name: "Gin", slug: "gin", parent: null, fieldGroup: "gin", sortOrder: 8 },
  { name: "Vodka", slug: "vodka", parent: null, fieldGroup: "vodka", sortOrder: 9 },
  { name: "Amaro", slug: "amaro", parent: null, fieldGroup: "amaro", sortOrder: 10 },
  { name: "Liqueur", slug: "liqueur", parent: null, fieldGroup: "liqueur", sortOrder: 11 },
  { name: "Other", slug: "other", parent: null, fieldGroup: "other", sortOrder: 12 },

  { name: "Bourbon", slug: "bourbon", parent: "american-whiskey", fieldGroup: "whiskey", sortOrder: 1 },
  { name: "Rye", slug: "rye", parent: "american-whiskey", fieldGroup: "whiskey", sortOrder: 2 },
  { name: "Wheat Whiskey", slug: "wheat-whiskey", parent: "american-whiskey", fieldGroup: "whiskey", sortOrder: 3 },
  { name: "Corn Whiskey", slug: "corn-whiskey", parent: "american-whiskey", fieldGroup: "whiskey", sortOrder: 4 },
  { name: "American Single Malt", slug: "american-single-malt", parent: "american-whiskey", fieldGroup: "whiskey", sortOrder: 5 },
  { name: "Light Whiskey", slug: "light-whiskey", parent: "american-whiskey", fieldGroup: "whiskey", sortOrder: 6 },
  { name: "Tennessee", slug: "tennessee", parent: "american-whiskey", fieldGroup: "whiskey", sortOrder: 7 },

  { name: "Pot Still Irish Whiskey", slug: "pot-still-irish-whiskey", parent: "irish-whiskey", fieldGroup: "whiskey", sortOrder: 1 },
  { name: "Malt Irish Whiskey", slug: "malt-irish-whiskey", parent: "irish-whiskey", fieldGroup: "whiskey", sortOrder: 2 },
  { name: "Grain Irish Whiskey", slug: "grain-irish-whiskey", parent: "irish-whiskey", fieldGroup: "whiskey", sortOrder: 3 },
  { name: "Blended Irish Whiskey", slug: "blended-irish-whiskey", parent: "irish-whiskey", fieldGroup: "whiskey", sortOrder: 4 },

  { name: "Single Malt Scotch Whisky", slug: "single-malt-scotch", parent: "scotch", fieldGroup: "whiskey", sortOrder: 1 },
  { name: "Single Grain Scotch Whisky", slug: "single-grain-scotch", parent: "scotch", fieldGroup: "whiskey", sortOrder: 2 },
  { name: "Blended Scotch Whisky", slug: "blended-scotch", parent: "scotch", fieldGroup: "whiskey", sortOrder: 3 },
  { name: "Blended Grain Scotch Whisky", slug: "blended-grain-scotch", parent: "scotch", fieldGroup: "whiskey", sortOrder: 4 },
  { name: "Blended Malt Scotch Whisky", slug: "blended-malt-scotch", parent: "scotch", fieldGroup: "whiskey", sortOrder: 5 },

  { name: "Canadian Whisky", slug: "canadian-whisky", parent: "whiskey", fieldGroup: "whiskey", sortOrder: 1 },
  { name: "Japanese Whisky", slug: "japanese", parent: "whiskey", fieldGroup: "whiskey", sortOrder: 2 },
  { name: "Other International Whisky", slug: "international", parent: "whiskey", fieldGroup: "whiskey", sortOrder: 3 },
  { name: "Flavored Whisky", slug: "flavored-whisky", parent: "whiskey", fieldGroup: "whiskey", sortOrder: 4 },

  { name: "Cachaça", slug: "cachaca", parent: "rum", fieldGroup: "rum", sortOrder: 1 },
  { name: "Rhum Agricole", slug: "agricole", parent: "rum", fieldGroup: "rum", sortOrder: 2 },
  { name: "Flavored / Spiced Rum", slug: "spiced-rum", parent: "rum", fieldGroup: "rum", sortOrder: 3 },

  { name: "Tequila", slug: "tequila", parent: "agave", fieldGroup: "agave", sortOrder: 1 },
  { name: "Mezcal", slug: "mezcal", parent: "agave", fieldGroup: "agave", sortOrder: 2 },

  { name: "Cognac", slug: "cognac", parent: "brandy", fieldGroup: "brandy", sortOrder: 1 },
  { name: "Armagnac", slug: "armagnac", parent: "brandy", fieldGroup: "brandy", sortOrder: 2 },
  { name: "Calvados", slug: "calvados", parent: "brandy", fieldGroup: "brandy", sortOrder: 3 },
  { name: "Pisco", slug: "pisco", parent: "brandy", fieldGroup: "brandy", sortOrder: 4 },
  { name: "Apple Brandy", slug: "apple", parent: "brandy", fieldGroup: "brandy", sortOrder: 5 },
  { name: "Eau de Vie", slug: "eau-de-vie", parent: "brandy", fieldGroup: "brandy", sortOrder: 6 },

  { name: "Genever", slug: "genever", parent: "gin", fieldGroup: "gin", sortOrder: 1 },
  { name: "Flavored Vodka", slug: "flavored-vodka", parent: "vodka", fieldGroup: "vodka", sortOrder: 1 },

  { name: "Fruit Liqueur", slug: "fruit-liqueur", parent: "liqueur", fieldGroup: "liqueur", sortOrder: 1 },
  { name: "Anise Liqueur", slug: "anise-liqueur", parent: "liqueur", fieldGroup: "liqueur", sortOrder: 2 },
  { name: "Cream Liqueur", slug: "cream-liqueur", parent: "liqueur", fieldGroup: "liqueur", sortOrder: 3 },
  { name: "Nut Liqueur", slug: "nut-liqueur", parent: "liqueur", fieldGroup: "liqueur", sortOrder: 4 },
  { name: "Herbal Liqueur", slug: "herbal-liqueur", parent: "liqueur", fieldGroup: "liqueur", sortOrder: 5 },
  { name: "Chocolate Liqueur", slug: "chocolate-liqueur", parent: "liqueur", fieldGroup: "liqueur", sortOrder: 6 },
  { name: "Coffee Liqueur", slug: "coffee-liqueur", parent: "liqueur", fieldGroup: "liqueur", sortOrder: 7 },

  { name: "Absinthe", slug: "absinthe", parent: "other", fieldGroup: "other", sortOrder: 1 },
  { name: "Akvavit", slug: "akvavit", parent: "other", fieldGroup: "other", sortOrder: 2 },
  { name: "Shochu", slug: "shochu", parent: "other", fieldGroup: "other", sortOrder: 3 },
];
