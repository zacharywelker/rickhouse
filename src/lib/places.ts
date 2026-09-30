/**
 * Places, as a label states them: a city, a state, a country, any of them
 * missing. Used to name and match the "Undisclosed (…)" placeholder distilleries,
 * so "NY", "ny" and "New York" all land on the same row instead of three.
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

const HOME_COUNTRY_ALIASES = new Set(["usa", "us", "u.s.", "u.s.a.", "united states", "united states of america", "america"]);

const squash = (value: string | null | undefined): string => (value ?? "").trim().replace(/\s+/g, " ");

/** "us", "U.S.A." and "United States" are all USA; blank is USA too, the app's default. Others are kept as typed. */
export function normalizeCountry(input: string | null | undefined): string {
  const value = squash(input);
  if (value === "") return HOME_COUNTRY;
  return HOME_COUNTRY_ALIASES.has(value.toLowerCase()) ? HOME_COUNTRY : value;
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

export type Place = { city: string | null; state: string | null; country: string };

/** A place from whatever was typed: trimmed, the state and country corrected, blanks as null. */
export function normalizePlace(input: { city?: string | null; state?: string | null; country?: string | null }): Place {
  const country = normalizeCountry(input.country);
  const city = squash(input.city);
  const state = normalizeState(input.state, country);
  return { city: city === "" ? null : city, state: state === "" ? null : state, country };
}

/**
 * "Undisclosed (Louisville, Kentucky)". The country is left out for the US when
 * there is anything more specific, and stands alone when there is not:
 * "Undisclosed (Scotland)", "Undisclosed (USA)".
 */
export function undisclosedName(place: Place): string {
  const parts = [place.city, place.state].filter((part): part is string => part !== null);
  if (place.country !== HOME_COUNTRY || parts.length === 0) parts.push(place.country);
  return `Undisclosed (${parts.join(", ")})`;
}

/** Whether two places are the same one, ignoring case and spelling of the state. */
export function samePlace(a: Place, b: Place): boolean {
  const key = (place: Place) =>
    [place.city, place.state, place.country].map((part) => (part ?? "").toLowerCase()).join("|");
  return key(a) === key(b);
}
