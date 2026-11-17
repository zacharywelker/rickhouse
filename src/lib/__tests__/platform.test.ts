import { afterEach, describe, expect, it, vi } from "vitest";
import { platformKeyName } from "../platform";

afterEach(() => vi.unstubAllGlobals());

describe("platformKeyName", () => {
  it("is Option on a Mac, from the browser's platform data", () => {
    vi.stubGlobal("navigator", { userAgentData: { platform: "macOS" }, platform: "MacIntel" });
    expect(platformKeyName()).toBe("Option");
  });
  it("is Option when only the older platform string is there", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    expect(platformKeyName()).toBe("Option");
  });
  it("is Alt on Windows and Linux", () => {
    vi.stubGlobal("navigator", { userAgentData: { platform: "Windows" } });
    expect(platformKeyName()).toBe("Alt");
    vi.stubGlobal("navigator", { platform: "Linux x86_64" });
    expect(platformKeyName()).toBe("Alt");
  });
  it("is Alt where there is no navigator (the server render)", () => {
    vi.stubGlobal("navigator", undefined);
    expect(platformKeyName()).toBe("Alt");
  });
});
