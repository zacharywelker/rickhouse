import { describe, expect, it } from "vitest";
import { MAX_PENDING_COLAS, normalizeTtbId, pendingTtbIds, registryUrl } from "../ids";
import { nameMatch, rankResults, registryCase, searchWindow } from "../format";

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
    expect(registryCase("WHISKY BOTTLED IN BOND (BIB)")).toBe("Whisky Bottled in Bond (BIB)");
    expect(registryCase("SPIRIT OF THE HILLS")).toBe("Spirit of the Hills");
  });

  it("leaves text that already has lower case alone", () => {
    expect(registryCase("Hotaling & Co., LLC")).toBe("Hotaling & Co., LLC");
  });
});

describe("searchWindow", () => {
  const now = new Date(Date.UTC(2026, 8, 29));

  it("covers the latest 15 years, the registry's limit", () => {
    const { from, to, label } = searchWindow(0, now);
    expect(to.toISOString().slice(0, 10)).toBe("2026-09-29");
    expect(from.toISOString().slice(0, 10)).toBe("2011-09-30");
    expect(label).toBe("2011–2026");
  });

  it("steps back 15 years at a time", () => {
    expect(searchWindow(1, now).label).toBe("1996–2011");
    expect(searchWindow(1, now).to.toISOString().slice(0, 10)).toBe("2011-09-29");
  });
});

describe("rankResults", () => {
  it("puts the label's own name first, then shared words, then the newest", () => {
    const rows = [
      { fancifulName: "TOASTED BARREL", completedOn: "2023-03-29" },
      { fancifulName: "6 YEARS OLD", completedOn: "2023-05-01" },
      { fancifulName: "6 YO", completedOn: "2021-05-14" },
      { fancifulName: null, completedOn: "2024-01-01" },
    ];
    expect(rankResults(rows, "6 YO").map((row) => [row.fancifulName, row.match])).toEqual([
      ["6 YO", 3],
      ["6 YEARS OLD", 1],
      [null, 0],
      ["TOASTED BARREL", 0],
    ]);
  });
});

describe("nameMatch", () => {
  it("prefers the approval sharing more of the label's words", () => {
    expect(nameMatch("Test 6 YO", "6 YO")).toBeGreaterThan(nameMatch("Test 6 YO", "6 YEARS OLD"));
  });

  it("ignores case and punctuation", () => {
    expect(nameMatch("Hotaling's Whiskey", "HOTALING'S WHISKEY")).toBe(4);
    expect(nameMatch("Single Barrel", "SINGLE BARREL RESERVE PORT FINISH")).toBe(2);
    expect(nameMatch("Double Oak", null)).toBe(0);
  });
});

describe("pendingTtbIds", () => {
  it("reads the new label form's JSON list: normalized, deduplicated, in order", () => {
    expect(pendingTtbIds('["21132001000620", "23117 001 000590", "21132001000620"]')).toEqual([
      "21132001000620",
      "23117001000590",
    ]);
  });

  it("drops anything that is not a TTB ID, and caps the list", () => {
    expect(pendingTtbIds('["nope", 42, null, "21132001000620"]')).toEqual(["21132001000620"]);
    const many = JSON.stringify(Array.from({ length: 15 }, (_, i) => `2113200100${String(i).padStart(4, "0")}`));
    expect(pendingTtbIds(many)).toHaveLength(MAX_PENDING_COLAS);
  });

  it("treats a missing or broken field as no approvals", () => {
    expect(pendingTtbIds(null)).toEqual([]);
    expect(pendingTtbIds("")).toEqual([]);
    expect(pendingTtbIds("{not json")).toEqual([]);
    expect(pendingTtbIds('{"a":1}')).toEqual([]);
  });
});
