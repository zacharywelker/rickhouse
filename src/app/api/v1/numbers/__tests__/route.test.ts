import { beforeEach, describe, expect, it, vi } from "vitest";

const store = { user: { id: 1 } as { id: number } | null };

vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => store.user }));
vi.mock("@/lib/preferences", () => ({ getCurrency: async () => "USD" }));
vi.mock("@/lib/dashboard/numbers", () => ({
  stockpile: async () => ({ onShelf: 0 }),
  money: async () => ({ acquired: 0 }),
  acquiring: async () => ({}),
  shelf: async () => ({}),
}));
vi.mock("@/lib/dashboard/findings", () => ({
  buildNumbers: () => ({
    lead: { id: "sealed", chapter: "stockpile", figure: "9", sentence: "never opened.", href: "/bottles?open=closed", weight: 1 },
    chapters: [
      {
        id: "money",
        number: "02",
        title: "Money",
        coverage: null,
        thin: false,
        findings: [{ id: "priciest", chapter: "money", figure: "$300", sentence: "was the most.", href: "/bottles/42", weight: 0.5 }],
      },
    ],
  }),
}));

const { GET } = await import("../route");

describe("GET /api/v1/numbers", () => {
  beforeEach(() => {
    store.user = { id: 1 };
  });

  it("needs a sign-in", async () => {
    store.user = null;
    expect((await GET()).status).toBe(401);
  });

  it("points a finding at its bottles, or at the one bottle", async () => {
    const body = await (await GET()).json();
    expect(body.lead).toMatchObject({ figure: "9", bottles: "open=closed", bottleId: null });
    expect(body.chapters[0].findings[0]).toMatchObject({ bottleId: 42, bottles: null });
  });
});
