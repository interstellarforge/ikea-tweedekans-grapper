export type CountryCode = "nl" | "be" | "de";

export type Country = {
  name: string;
  /** languageCode for the as-is API (descriptions). */
  apiLanguage: string;
  /** Path on ikea.com for the second-hand page. */
  ikeaPath: string;
};

export const COUNTRIES: Record<CountryCode, Country> = {
  nl: { name: "Nederland", apiLanguage: "nl", ikeaPath: "nl/nl" },
  be: { name: "België", apiLanguage: "nl", ikeaPath: "be/nl" },
  de: { name: "Duitsland", apiLanguage: "de", ikeaPath: "de/de" },
};

export const COUNTRY_CODES = Object.keys(COUNTRIES) as CountryCode[];

export const isCountry = (code: string): code is CountryCode =>
  code in COUNTRIES;

export const DEFAULT_COUNTRIES: CountryCode[] = ["nl"];
