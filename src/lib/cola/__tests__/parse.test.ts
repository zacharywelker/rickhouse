import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ColaNotFoundError, ColaParseError, parseColaDetail, parseColaForm, registryDate } from "../parse";

/**
 * Real pages from TTB's public COLA registry, saved as served (ISO-8859-1),
 * with the filer's contact name and phone number replaced. When TTB changes
 * its markup, re-save these and fix the parser until they pass.
 */
function fixture(name: string): string {
  return readFileSync(path.join(__dirname, "fixtures", name), "latin1");
}

describe("parseColaDetail", () => {
  it("reads a domestic straight rye (Old Potrero 6 YO)", () => {
    expect(parseColaDetail(fixture("21132001000620-detail.html"), "21132001000620")).toEqual({
      ttbId: "21132001000620",
      status: "APPROVED",
      serialNumber: "210027",
      classType: "STRAIGHT RYE WHISKY",
      origin: "CALIFORNIA",
      brandName: "OLD POTRERO",
      fancifulName: "6 YO",
      applicationType: "LABEL APPROVAL",
      approvedOn: "2021-05-14",
      permitNumber: "DSP-CA-267",
      applicantName: "Hotaling & Co., LLC",
      applicantAddress: "PIER 50, SHED B, San Francisco, CA 94158",
    });
  });

  it("reads an import with no fanciful name (Laphroaig)", () => {
    const record = parseColaDetail(fixture("24011001000462-detail.html"), "24011001000462");
    expect(record).toMatchObject({
      brandName: "LAPHROAIG",
      fancifulName: null,
      classType: "SINGLE MALT SCOTCH WHISKY",
      origin: "SCOTLAND",
      permitNumber: "IL-I-198",
      applicantName: "JIM BEAM BRANDS CO.",
      approvedOn: "2024-01-11",
    });
  });

  it("never reads the filer's contact details", () => {
    const record = parseColaDetail(fixture("21132001000620-detail.html"), "21132001000620");
    expect(JSON.stringify(record)).not.toMatch(/Contact|555/);
  });

  it("reports an unknown TTB ID as not found", () => {
    expect(() => parseColaDetail(fixture("not-found.html"), "99999999999999")).toThrow(ColaNotFoundError);
  });

  it("refuses a record for a different TTB ID", () => {
    expect(() => parseColaDetail(fixture("21132001000620-detail.html"), "24011001000462")).toThrow(ColaParseError);
  });

  it("refuses a page whose markup has changed rather than returning blanks", () => {
    const changed = fixture("21132001000620-detail.html").replaceAll("<strong>", "<b>").replaceAll("</strong>", "</b>");
    expect(() => parseColaDetail(changed, "21132001000620")).toThrow(ColaParseError);
  });
});

describe("parseColaForm", () => {
  it("reads the codes, the source and the label panels", () => {
    expect(parseColaForm(fixture("21132001000620-form.html"), "21132001000620")).toEqual({
      classTypeCode: "102",
      originCode: "01",
      isImported: false,
      images: [
        {
          href: "/colasonline/publicViewAttachment.do?filename=op 6yo brand label NEW.jpg&filetype=l",
          panel: "Brand (front) or keg collar",
        },
        {
          href: "/colasonline/publicViewAttachment.do?filename=op 6yo strip label NEW.jpg&filetype=l",
          panel: "Other",
        },
      ],
    });
  });

  it("marks an import as imported and leaves out the signature image", () => {
    const form = parseColaForm(fixture("24011001000462-form.html"), "24011001000462");
    expect(form.isImported).toBe(true);
    expect(form.classTypeCode).toBe("153");
    expect(form.images.map((image) => image.panel)).toEqual(["Brand (front) or keg collar", "Back"]);
    expect(form.images.every((image) => !image.href.includes("Signature"))).toBe(true);
  });

  it("reports an unknown TTB ID as not found", () => {
    expect(() => parseColaForm(fixture("not-found.html"), "99999999999999")).toThrow(ColaNotFoundError);
  });
});

describe("registryDate", () => {
  it("turns MM/DD/YYYY into an ISO date", () => {
    expect(registryDate("05/14/2021")).toBe("2021-05-14");
    expect(registryDate("2021-05-14")).toBeNull();
    expect(registryDate(null)).toBeNull();
  });
});
