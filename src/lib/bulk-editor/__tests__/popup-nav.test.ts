import { describe, expect, it } from "vitest";
import { chain, nextOf, stepOf } from "../popup-nav";

const params = (url: string) => new URLSearchParams(url.split("?")[1] ?? "");

describe("a chain of popup steps", () => {
  it("is just the url when there is one step", () => {
    expect(chain(["/a"])).toBe("/a");
  });
  it("carries the second step as `next`, and the heading on each url", () => {
    const first = chain(["/expressions/7/edit", "/bottles/12/edit"]);
    expect(first).toBe("/expressions/7/edit?next=%2Fbottles%2F12%2Fedit%3Fstep%3D2%26of%3D2&step=1&of=2");
    expect(nextOf(params(first))).toBe("/bottles/12/edit?step=2&of=2");
    expect(stepOf(params(first))).toEqual({ step: 1, of: 2 });
    expect(stepOf(params(nextOf(params(first))!))).toEqual({ step: 2, of: 2 });
  });
  it("keeps a step's own query string", () => {
    const first = chain(["/bottles/add?expression=7&prefill=T", "/bottles/12/edit"]);
    expect(first.startsWith("/bottles/add?expression=7&prefill=T&next=")).toBe(true);
    expect(params(first).get("expression")).toBe("7");
    expect(params(first).get("prefill")).toBe("T");
  });
  it("nests for three steps, each step knowing where it is", () => {
    const first = chain(["/a", "/b", "/c"]);
    const second = nextOf(params(first))!;
    expect(stepOf(params(second))).toEqual({ step: 2, of: 3 });
    expect(nextOf(params(second))).toBe("/c?step=3&of=3");
  });
});

describe("reading a url's parameters", () => {
  it("has no next or step on a plain url", () => {
    expect(nextOf(new URLSearchParams(""))).toBeNull();
    expect(stepOf(new URLSearchParams(""))).toBeNull();
  });
  it("takes a next that is a path on this site", () => {
    expect(nextOf(new URLSearchParams("next=%2Fbottles%2F12%2Fedit"))).toBe("/bottles/12/edit");
  });
  it("refuses a next that leaves the site, so it cannot be an open redirect", () => {
    for (const bad of ["https://evil.example/x", "//evil.example/x", "/\\evil.example", "javascript:alert(1)", "bottles/12"]) {
      expect(nextOf(new URLSearchParams({ next: bad })), bad).toBeNull();
    }
  });
  it("ignores a step that is not two positive whole numbers with step no larger than of", () => {
    expect(stepOf(new URLSearchParams("step=0&of=2"))).toBeNull();
    expect(stepOf(new URLSearchParams("step=3&of=2"))).toBeNull();
    expect(stepOf(new URLSearchParams("step=a&of=2"))).toBeNull();
    expect(stepOf(new URLSearchParams("step=1"))).toBeNull();
  });
});
