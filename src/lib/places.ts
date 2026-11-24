/**
 * Places: a city, a state, a country, any of them missing. Every location in the
 * app (distilleries, companies, stores) is kept as these three fields, entered
 * and shown the same way. Also names and matches the "Undisclosed (…)"
 * placeholder distilleries, so "NY", "ny" and "New York" all land on the same
 * row instead of three.
 *
 * Only US states are corrected. Anywhere else a state or province is kept as
 * typed, because guessing at "AB" or "NSW" would do more harm than good.
 */

export const US_STATES: Readonly<Record<string, string>> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

const STATE_BY_LOWERCASE_NAME = new Map(Object.values(US_STATES).map((name) => [name.toLowerCase(), name]));

/** The default, and what the app stores for the United States. */
export const HOME_COUNTRY = "USA";

/**
 * The countries a spirit is made in, with the other spellings people type. Anything typed that matches one of these
 * (ignoring case, accents, dots and "&") is stored under the first name. A country not listed is kept as typed.
 */
const COUNTRY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  USA: ["us", "u.s.", "u.s.a.", "united states", "united states of america", "america"],
  "United Kingdom": ["uk", "u.k.", "gb", "great britain", "britain", "united kingdom of great britain and northern ireland"],
  Scotland: [],
  England: [],
  Wales: [],
  "Northern Ireland": [],
  Ireland: ["ie", "eire", "republic of ireland"],
  Canada: ["ca"],
  Mexico: ["mx"],
  France: ["fr"],
  Germany: ["de", "deutschland"],
  Netherlands: ["nl", "the netherlands", "holland"],
  Belgium: ["be"],
  Spain: ["es", "espana"],
  Italy: ["it", "italia"],
  Portugal: ["pt"],
  Switzerland: ["ch"],
  Austria: [],
  Sweden: ["se"],
  Norway: [],
  Denmark: ["dk"],
  Finland: [],
  Poland: [],
  Russia: [],
  "Czech Republic": ["czechia"],
  Japan: ["jp"],
  Taiwan: [],
  China: [],
  India: [],
  "South Korea": ["korea", "republic of korea"],
  Thailand: [],
  Philippines: [],
  Australia: ["au"],
  "New Zealand": ["nz"],
  "South Africa": ["za"],
  Cuba: [],
  Jamaica: [],
  Barbados: [],
  Guyana: [],
  "Trinidad and Tobago": ["trinidad"],
  "Dominican Republic": [],
  "Puerto Rico": [],
  Haiti: [],
  Martinique: [],
  Guadeloupe: [],
  Brazil: ["br", "brasil"],
  Colombia: [],
  Guatemala: [],
  Panama: [],
  Venezuela: [],
  Nicaragua: [],
  Peru: ["pe"],
  Chile: ["cl"],
  Argentina: [],
  "United Arab Emirates": ["uae", "emirates"],
  Turkey: ["turkiye"],
  Israel: [],
};

/** Lower case, no accents or dots, "&" as "and", single spaces: how a typed country is looked up. */
const countryKey = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/&/g, "and")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const COUNTRY_SMALL_WORDS: ReadonlySet<string> = new Set(["of", "and", "the", "de", "del", "la", "le", "du"]);

const COUNTRY_BY_KEY: ReadonlyMap<string, string> = new Map(
  Object.entries(COUNTRY_ALIASES).flatMap(([canonical, aliases]) =>
    [canonical, ...aliases].map((spelling) => [countryKey(spelling), canonical] as const),
  ),
);

const hasText = (value: string | null | undefined): value is string => (value ?? "").trim() !== "";

const squash = (value: string | null | undefined): string => (value ?? "").trim().replace(/\s+/g, " ");

/**
 * The country as the app stores it. "us", "U.S.A." and "United States" are all USA, "mexico", "México" and "MX" are
 * all Mexico, "uk" is United Kingdom, and so on for the countries a spirit comes from; blank is USA too, the app's
 * default. A country that is not listed is kept as typed, apart from capitalising words typed all in one case.
 */
export function normalizeCountry(input: string | null | undefined): string {
  const value = squash(input);
  if (value === "") return HOME_COUNTRY;
  const known = COUNTRY_BY_KEY.get(countryKey(value));
  if (known) return known;
  const oneCase = value === value.toLowerCase() || (value === value.toUpperCase() && value.length > 3);
  if (!oneCase) return value;
  // Words of a country typed in one case: capitalised, except the small ones inside a name ("Isle of Man") and a
  // leading "d'" ("Côte d'Ivoire"), where the letter after the apostrophe is the one that is capitalised.
  return value
    .toLowerCase()
    .split(" ")
    .map((word, index) => {
      if (index > 0 && COUNTRY_SMALL_WORDS.has(word)) return word;
      // "d'ivoire" keeps its d and capitalises the i; every other word, and each part after a hyphen, starts with a capital.
      if (/^\p{L}'\p{L}/u.test(word)) return word.replace(/^(\p{L}')(\p{L})/u, (_, lead: string, letter: string) => lead + letter.toUpperCase());
      return word.replace(/(^|-)(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase());
    })
    .join(" ");
}

/**
 * "ny" becomes "New York", "new york" becomes "New York". Anything that is not a
 * US state, or is in another country, comes back as typed (trimmed).
 */
export function normalizeState(input: string | null | undefined, country: string = HOME_COUNTRY): string {
  const value = squash(input);
  if (value === "" || normalizeCountry(country) !== HOME_COUNTRY) return value;
  return US_STATES[value.toUpperCase()] ?? STATE_BY_LOWERCASE_NAME.get(value.toLowerCase()) ?? value;
}

export function isScotchCountry(country: string): boolean {
  const normalized = normalizeCountry(country);
  return normalized === "Scotland" || normalized === "United Kingdom";
}

export type Place = { city: string | null; state: string | null; country: string };

/** A place from whatever was typed: trimmed, the state and country corrected, blanks as null. */
export function normalizePlace(input: { city?: string | null; state?: string | null; country?: string | null }): Place {
  const country = normalizeCountry(input.country);
  const city = squash(input.city);
  const state = normalizeState(input.state, country);
  return { city: city === "" ? null : city, state: state === "" ? null : state, country };
}

/** A place that may have no country at all, like an online store's. */
export type Location = { city: string | null; state: string | null; country: string | null };

/**
 * Like normalizePlace, but a blank country stays blank instead of becoming USA,
 * for the places where a location is optional. A US state is still corrected
 * when no country is given.
 */
export function normalizeLocation(input: { city?: string | null; state?: string | null; country?: string | null }): Location {
  const country = squash(input.country);
  const place = normalizePlace(input);
  return { ...place, country: country === "" ? null : place.country };
}

/**
 * "Louisville, Kentucky", "Speyside, Scotland", "Mexico". The country is left
 * out for the US when there is anything more specific. Null when nothing is set.
 */
export function formatPlace(place: { city?: string | null; state?: string | null; country?: string | null }): string | null {
  const parts = [place.city, place.state].filter(hasText);
  const country = hasText(place.country) ? place.country : null;
  if (country !== null && (country !== HOME_COUNTRY || parts.length === 0)) parts.push(country);
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * "Undisclosed (Louisville, Kentucky)". The country is left out for the US when
 * there is anything more specific, and stands alone when there is not:
 * "Undisclosed (Scotland)", "Undisclosed (USA)".
 */
export function undisclosedName(place: Place): string {
  return `Undisclosed (${formatPlace(place) ?? place.country})`;
}

/** Whether two places are the same one, ignoring case and spelling of the state. */
export function samePlace(a: Place, b: Place): boolean {
  const key = (place: Place) =>
    [place.city, place.state, place.country].map((part) => (part ?? "").toLowerCase()).join("|");
  return key(a) === key(b);
}
