import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.fn();
const rows = [{ name: "Wheat", family: null, kind: "vodka_base" }];
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => rows }) }) }) } }));

import { GET } from "../route";

const get = (query: string) => GET(new NextRequest(`https://rickhouse.example.com/api/v1/ingredients${query}`));
const KINDS = ["maguey", "distillate", "rum_base", "botanical", "gin_base", "vodka_base", "flavor", "liqueur_base"];

beforeEach(() => {
  getCurrentUser.mockReset();
  getCurrentUser.mockResolvedValue({ id: 7 });
});

describe("GET /api/v1/ingredients", () => {
  it.each(KINDS)("answers 200 for %s", async (kind) => {
    const res = await get(`?kind=${kind}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ingredients: rows });
  });

  it("answers 422 for an unknown or missing kind", async () => {
    expect((await get("?kind=whiskey_base")).status).toBe(422);
    expect((await get("")).status).toBe(422);
  });

  it("answers 401 when signed out", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await get("?kind=flavor")).status).toBe(401);
  });
});
