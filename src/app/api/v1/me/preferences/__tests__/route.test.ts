import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const store = { currency: "USD", user: { id: 1 } as { id: number } | null };

vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => store.user }));
vi.mock("@/lib/preferences", () => ({
  getPreferences: async () => ({ searchFirstAdd: false, currency: store.currency }),
  updatePreferences: async (_id: number, patch: { currency: string }) => {
    store.currency = patch.currency;
  },
}));

const { GET, PUT } = await import("../route");

const put = (body: unknown, type = "application/json") =>
  PUT(new NextRequest("https://x.test/api/v1/me/preferences", { method: "PUT", headers: { "content-type": type }, body: JSON.stringify(body) }));

describe("/api/v1/me/preferences", () => {
  beforeEach(() => {
    store.currency = "USD";
    store.user = { id: 1 };
  });

  it("needs a sign-in", async () => {
    store.user = null;
    expect((await GET()).status).toBe(401);
    expect((await put({ currency: "EUR" })).status).toBe(401);
  });

  it("reads the currency and the list", async () => {
    const body = await (await GET()).json();
    expect(body.currency).toBe("USD");
    expect(body.currencies.find((c: { code: string }) => c.code === "JPY")).toMatchObject({ symbol: "¥", decimals: 0 });
  });

  it("saves a listed currency and refuses the rest", async () => {
    expect((await (await put({ currency: "GBP" })).json()).currency).toBe("GBP");
    expect(store.currency).toBe("GBP");
    expect((await put({ currency: "XXX" })).status).toBe(422);
    expect((await put({ currency: 5 })).status).toBe(422);
    expect((await put({ currency: "EUR" }, "text/plain")).status).toBe(415);
    expect(store.currency).toBe("GBP");
  });
});
