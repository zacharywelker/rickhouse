import { describe, expect, it } from "vitest";
import { inferFinishType } from "../finish-type";

describe("inferFinishType", () => {
  it.each([
    ["Tawny Port Cask", "fortified"],
    ["French Oak", "wood"],
    ["Cognac", "spirit"],
    ["Winter Bock", "beer"],
    ["Mystery", null],
    ["Portugal", null],
    ["Port", "fortified"],
    ["PX Sherry", "fortified"],
    ["  tawny   port ", "fortified"],
    ["", null],
    ["Whisk", "spirit"],
    ["Whiskey", "spirit"],
    ["Whisky", "spirit"],
    ["Rum Beer", "spirit"],
    ["Beer Port", "beer"],
    ["Port Wine", "fortified"],
    ["Wine Oak", "wine"],
  ] as const)("infers %j as %j", (name, expected) => {
    expect(inferFinishType(name)).toBe(expected);
  });
});
