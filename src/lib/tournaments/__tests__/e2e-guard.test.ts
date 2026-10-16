import { describe, expect, it } from "vitest";
import { assertThrowawayDatabase } from "../../../../e2e/support/tournament-field";

const at = (name: string) => `postgres://rickhouse:rickhouse@127.0.0.1:5432/${name}`;

describe("assertThrowawayDatabase", () => {
  it("passes the throwaway databases", () => {
    for (const name of ["rickhouse_tourney_web", "rickhouse_tourney_proto", "scratch", "rickhouse_test", "test_rickhouse"]) {
      expect(() => assertThrowawayDatabase(at(name))).not.toThrow();
    }
    expect(() => assertThrowawayDatabase(`${at("rickhouse_tourney_web")}?sslmode=disable`)).not.toThrow();
  });
  it("refuses the real database, look-alikes, and an empty or broken URL", () => {
    for (const name of ["rickhouse", "contest", "latest", "protocol", "rickhouse_prod"]) {
      expect(() => assertThrowawayDatabase(at(name))).toThrow(/throwaway/);
    }
    expect(() => assertThrowawayDatabase("")).toThrow(/throwaway/);
    expect(() => assertThrowawayDatabase("not a url")).toThrow(/throwaway/);
  });
  it("refuses a database that is not on this machine, even with a throwaway name", () => {
    expect(() => assertThrowawayDatabase("postgres://u:p@db.example.com:5432/rickhouse_test")).toThrow(/throwaway/);
    expect(() => assertThrowawayDatabase(`${at("rickhouse_test")}?host=db.example.com`)).toThrow(/throwaway/);
    expect(() => assertThrowawayDatabase("postgres://u:p@localhost:5432/rickhouse_test")).not.toThrow();
  });
});
