import { describe, expect, it } from "vitest";
import { normalizeTtbId, registryUrl } from "../ids";
import { categorySlugFor, registryCase, suggestLabel } from "../map";

describe("normalizeTtbId", () => {
  it("accepts the bare number, with or without separators", () => {
    expect(normalizeTtbId("21132001000620")).toBe("21132001000620");
    expect(normalizeTtbId(" 21132 001 000620 ")).toBe("21132001000620");
    expect(normalizeTtbId("21-132-001-000620")).toBe("21132001000620");
  });

  it("pulls the ID out of a registry link", () => {
    expect(
      normalizeTtbId(
        "https://ttbonline.gov/colasonline/viewColaDetails.do?action=publicDisplaySearchBasic&ttbid=21132001000620",
      ),
    ).toBe("21132001000620");
  });

  it("rejects anything else", () => {
    expect(normalizeTtbId("")).toBeNull();
    expect(normalizeTtbId("2113200100062")).toBeNull();
    expect(normalizeTtbId("211320010006201")).toBeNull();
    expect(normalizeTtbId("OLD POTRERO")).toBeNull();
  });
});

describe("registryUrl", () => {
  it("resolves the registry's relative links, spaces and all", () => {
    const url = registryUrl("/colasonline/publicViewAttachment.do?filename=op 6yo brand label NEW.jpg&filetype=l");
    expect(url?.toString()).toBe(
      "https://www.ttbonline.gov/colasonline/publicViewAttachment.do?filename=op%206yo%20brand%20label%20NEW.jpg&filetype=l",
    );
  });

  it("refuses to leave the registry", () => {
    expect(registryUrl("https://example.com/colasonline/x")).toBeNull();
    expect(registryUrl("//evil.example/x")).toBeNull();
    expect(registryUrl("http://www.ttbonline.gov/colasonline/x")).toBeNull();
    expect(registryUrl("https://www.ttbonline.gov:8443/x")).toBeNull();
    expect(registryUrl("https://user:pw@www.ttbonline.gov/x")).toBeNull();
    expect(registryUrl("https://www.ttbonline.gov.evil.example/x")).toBeNull();
  });
});

describe("registryCase", () => {
  it("title-cases the registry's capitals", () => {
    expect(registryCase("OLD POTRERO")).toBe("Old Potrero");
    expect(registryCase("SINGLE BARREL RESERVE PORT FINISH")).toBe("Single Barrel Reserve Port Finish");
    expect(registryCase("HOTALING'S")).toBe("Hotaling's");
    expect(registryCase("STRAIGHT RYE WHISKY")).toBe("Straight Rye Whisky");
  });

  it("keeps ages, grades and small words the way a label reads", () => {
    expect(registryCase("6 YO")).toBe("6 YO");
    expect(registryCase("18TH CENTURY")).toBe("18th Century");
    expect(registryCase("B524")).toBe("B524");
    expect(registryCase("VSOP")).toBe("VSOP");
    expect(registryCase("SPIRIT OF THE HILLS")).toBe("Spirit of the Hills");
  });

  it("leaves text that already has lower case alone", () => {
    expect(registryCase("Hotaling & Co., LLC")).toBe("Hotaling & Co., LLC");
  });
});

describe("categorySlugFor", () => {
  it("maps whisky classes to the seeded categories", () => {
    expect(categorySlugFor("STRAIGHT RYE WHISKY", "CALIFORNIA", false)).toBe("rye");
    expect(categorySlugFor("STRAIGHT BOURBON WHISKY", "KENTUCKY", false)).toBe("bourbon");
    expect(categorySlugFor("SINGLE MALT SCOTCH WHISKY", "SCOTLAND", true)).toBe("scotch");
    expect(categorySlugFor("IRISH WHISKY", "IRELAND", true)).toBe("irish-whiskey");
  });

  it("only calls a malt American when it is", () => {
    expect(categorySlugFor("MALT WHISKY", "CALIFORNIA", false)).toBe("american-single-malt");
    expect(categorySlugFor("MALT WHISKY", "JAPAN", true)).toBe("whiskey");
  });

  it("puts a plain whisky under American Whiskey when it is American", () => {
    expect(categorySlugFor("WHISKY SPECIALTIES", "CALIFORNIA", false)).toBe("american-whiskey");
    expect(categorySlugFor("OTHER WHISKY", "CANADA", true)).toBe("whiskey");
  });

  it("maps other spirits to their family, and nothing to a guess", () => {
    expect(categorySlugFor("PUERTO RICAN RUM", "PUERTO RICO", false)).toBe("rum");
    expect(categorySlugFor("TEQUILA FB", "MEXICO", true)).toBe("agave");
    expect(categorySlugFor("COGNAC (BRANDY) FB", "FRANCE", true)).toBe("brandy");
    expect(categorySlugFor("STOUT", "CALIFORNIA", false)).toBeNull();
    expect(categorySlugFor(null, null, null)).toBeNull();
  });
});

describe("suggestLabel", () => {
  it("names the label from the fanciful name", () => {
    expect(
      suggestLabel({
        brandName: "OLD POTRERO",
        fancifulName: "6 YO",
        classType: "STRAIGHT RYE WHISKY",
        origin: "CALIFORNIA",
        isImported: false,
      }),
    ).toEqual({ brandName: "Old Potrero", name: "6 YO", categorySlug: "rye" });
  });

  it("falls back to the class when there is no fanciful name", () => {
    expect(
      suggestLabel({
        brandName: "LAPHROAIG",
        fancifulName: null,
        classType: "SINGLE MALT SCOTCH WHISKY",
        origin: "SCOTLAND",
        isImported: true,
      }).name,
    ).toBe("Single Malt Scotch Whisky");
  });
});
