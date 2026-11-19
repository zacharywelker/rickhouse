import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.fn();
const inserted: Array<Record<string, unknown>> = [];

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", () => ({
  db: {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserted.push(values);
        return { returning: async () => [{ id: 41 }] };
      },
    }),
  },
}));
vi.mock("@/lib/expressions/label-choices", () => ({ settleLabelChoices: vi.fn() }));
vi.mock("@/lib/expressions/queries", () => ({ bottleSpiritForExpression: async () => ({ kind: "american", ginAged: false }) }));
vi.mock("@/lib/bottles/grid", () => ({ queryBottles: vi.fn(), summariseBottles: vi.fn() }));

import { POST } from "../route";

const post = (body: unknown) =>
  POST(new NextRequest("https://rickhouse.example.com/api/v1/bottles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  inserted.length = 0;
  getCurrentUser.mockResolvedValue({ id: 7 });
});

describe("POST /api/v1/bottles and the vintage", () => {
  it("takes the chosen vintage as vintageId and keeps it on the bottle", async () => {
    const res = await post({ expressionId: 12, vintageId: 5 });
    expect(res.status).toBe(201);
    expect(inserted[0]).toMatchObject({ expressionId: 12, releaseId: 5, ownerId: 7 });
  });

  it("does not take releaseId any more", async () => {
    await post({ expressionId: 12, releaseId: 5 });
    expect(inserted[0]?.releaseId ?? null).toBeNull();
  });

  it("names the vintage field in an error", async () => {
    const res = await post({ expressionId: 12, vintageId: "not a number" });
    expect(res.status).toBe(422);
    const { error } = (await res.json()) as { error: { fields?: Record<string, string> } };
    expect(Object.keys(error.fields ?? {})).toContain("vintageId");
    expect(Object.keys(error.fields ?? {})).not.toContain("releaseId");
  });
});
