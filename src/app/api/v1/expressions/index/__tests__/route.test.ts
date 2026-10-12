import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const labelIndex = vi.fn();

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/expressions/queries", () => ({ labelIndex: (...args: unknown[]) => labelIndex(...args) }));

import { GET } from "../route";

beforeEach(() => {
  getCurrentUser.mockReset();
  labelIndex.mockReset();
});

describe("GET /api/v1/expressions/index", () => {
  it("asks for sign-in", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(labelIndex).not.toHaveBeenCalled();
  });

  it("answers with the caller's labels only", async () => {
    getCurrentUser.mockResolvedValue({ id: 7 });
    const row = { id: 1, brand: "Eagle Rare", name: "10 Year", category: "Bourbon", proof: "90", bottleCount: 1, tastingCount: 7, averageRating: "8.1", lastTastedOn: "2026-10-03" };
    labelIndex.mockResolvedValue([row]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(labelIndex).toHaveBeenCalledWith(7);
    expect(await res.json()).toEqual({ labels: [row] });
  });
});
