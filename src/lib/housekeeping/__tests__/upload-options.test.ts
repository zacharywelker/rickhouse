import { describe, expect, it, vi } from "vitest";

// upload-options imports the image store, which imports server-only.
vi.mock("server-only", () => ({}));

import { housekeepingStoreOptions } from "../upload-options";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
};

describe("housekeepingStoreOptions", () => {
  it("asks for the 600 px minimum when the request says it comes from Housekeeping", () => {
    expect(housekeepingStoreOptions(form({ source: "housekeeping" }))).toEqual({ minLongSide: 600 });
  });

  it("asks for nothing on any other request", () => {
    expect(housekeepingStoreOptions(form({}))).toEqual({});
    expect(housekeepingStoreOptions(form({ source: "other" }))).toEqual({});
    expect(housekeepingStoreOptions(form({ photo: "x" }))).toEqual({});
  });
});
