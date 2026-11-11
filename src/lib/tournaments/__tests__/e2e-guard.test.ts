import { describe, expect, it } from "vitest";
import { assertThrowawayDatabase, isThrowawayName, LOCAL_HOSTS } from "@/lib/throwaway-database";
import * as fromSpecSupport from "../../../../e2e/support/tournament-field";

const at = (name: string) => `postgres://rickhouse:rickhouse@127.0.0.1:5432/${name}`;

describe("assertThrowawayDatabase", () => {
  it("passes the throwaway databases", () => {
    for (const name of ["rickhouse_tourney_web", "rickhouse_tourney_proto", "scratch", "rickhouse_test", "test_rickhouse", "rickhouse_e2e", "rickhouse_audit", "rickhouse_bulkeditor_test"]) {
      expect(() => assertThrowawayDatabase(at(name))).not.toThrow();
    }
    expect(() => assertThrowawayDatabase(`${at("rickhouse_tourney_web")}?sslmode=disable`)).not.toThrow();
  });
  it("refuses the real database, look-alikes, and an empty or broken URL", () => {
    for (const name of ["rickhouse", "contest", "latest", "protocol", "rickhouse_prod", "rickhouse_auditor", "e2eprod", "attest"]) {
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
  it("takes the host names it is given, and still checks the name", () => {
    const compose = [...LOCAL_HOSTS, "db"];
    expect(() => assertThrowawayDatabase("postgres://u:p@db:5432/rickhouse_test", compose)).not.toThrow();
    expect(() => assertThrowawayDatabase("postgres://u:p@db:5432/rickhouse", compose)).toThrow(/throwaway/);
    expect(() => assertThrowawayDatabase("postgres://u:p@db:5432/rickhouse_test")).toThrow(/throwaway/);
  });
  it("names the database and host it refused, and never the credentials", () => {
    expect(() => assertThrowawayDatabase("postgres://someone:hunter2@localhost:5432/rickhouse")).toThrow(/"rickhouse" on localhost/);
    try {
      assertThrowawayDatabase("postgres://someone:hunter2@localhost:5432/rickhouse");
    } catch (error) {
      expect(String(error)).not.toMatch(/hunter2|someone/);
    }
  });
  it("is the same rule the specs import", () => {
    expect(fromSpecSupport.assertThrowawayDatabase).toBe(assertThrowawayDatabase);
  });
});

describe("isThrowawayName", () => {
  it("needs a whole segment, so look-alikes and substrings do not pass", () => {
    expect(["test", "a_test", "test_a", "a_test_b", "e2e", "audit"].every(isThrowawayName)).toBe(true);
    expect(["rickhouse", "contest", "latest", "tester", "e2e2", "auditor", ""].some(isThrowawayName)).toBe(false);
  });
});
