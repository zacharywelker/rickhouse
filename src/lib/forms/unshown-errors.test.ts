import { describe, expect, it } from "vitest";
import { unshownErrors } from "./unshown-errors";

describe("unshownErrors", () => {
  const additive = { key: "isAdditiveFree", label: "Additive Free", message: "Invalid option" };
  const regions = { key: "regions", label: "regions", message: "Unknown region" };

  it("names an error nothing on the page shows", () => {
    expect(unshownErrors([additive, regions], ["Unknown region"])).toEqual(["Additive Free (Invalid option)"]);
  });

  it("is empty when every error is drawn", () => {
    expect(unshownErrors([additive], ["Invalid option"])).toEqual([]);
  });

  it("counts a repeated message once per drawn copy", () => {
    const other = { key: "x", label: "X", message: "Invalid option" };
    expect(unshownErrors([additive, other], ["Invalid option"])).toEqual(["X (Invalid option)"]);
  });
});
