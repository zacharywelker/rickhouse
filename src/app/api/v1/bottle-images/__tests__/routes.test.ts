import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { user: { id: 1 } as { id: number } | null, ok: true };
const deleteImage = vi.fn(async (_id: number) => (state.ok ? { ok: true as const, message: "" } : { ok: false as const, error: "That image is already gone." }));
const setPrimary = vi.fn(async (_id: number) => ({ ok: true as const, message: "" }));
const deleteBottle = vi.fn(async (_id: number) => (state.ok ? { ok: true as const, message: "" } : { ok: false as const, error: "That bottle is gone." }));
const removePhoto = vi.fn(async (_id: number) => ({ ok: true as const, message: "" }));

vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/app/(app)/bottles/actions", () => ({ deleteBottleImageAction: deleteImage, deleteBottleAction: deleteBottle, setPrimaryImageAction: setPrimary }));
vi.mock("@/lib/releases-store", () => ({ releaseById: async () => null }));
vi.mock("@/lib/bottles/state", () => ({ setFill: async () => null }));
vi.mock("@/lib/tasting-wheel-for", () => ({ categoryWheels: async () => new Map() }));
vi.mock("@/lib/expressions/queries", () => ({ bottleImagesFor: async () => [], expressionLinks: async () => ({}), getBottle: async () => null, tastingNotesFor: async () => [] }));
vi.mock("@/app/(app)/expressions/photo-actions", () => ({ removeLabelPhotoAction: removePhoto }));

const del = await import("../[imageId]/route");
const primary = await import("../[imageId]/primary/route");
const labelPhoto = await import("../../expressions/[id]/photo/route");
const bottle = await import("../../bottles/[id]/route");
const ctx = (v: string) => ({ params: Promise.resolve({ imageId: v, id: v }) });
const req = new Request("https://x.test/");

describe("photo routes", () => {
  beforeEach(() => {
    state.user = { id: 1 };
    state.ok = true;
    vi.clearAllMocks();
  });

  it("refuse without a sign-in and touch nothing", async () => {
    state.user = null;
    expect((await del.DELETE(req, ctx("5"))).status).toBe(401);
    expect((await primary.PUT(req, ctx("5"))).status).toBe(401);
    expect((await labelPhoto.DELETE(req, ctx("5"))).status).toBe(401);
    expect(deleteImage).not.toHaveBeenCalled();
    expect(setPrimary).not.toHaveBeenCalled();
    expect(removePhoto).not.toHaveBeenCalled();
  });

  it("run the action for a good id and 404 a bad one or a stranger's photo", async () => {
    expect((await del.DELETE(req, ctx("5"))).status).toBe(200);
    expect(deleteImage).toHaveBeenCalledWith(5);
    expect((await primary.PUT(req, ctx("7"))).status).toBe(200);
    expect(setPrimary).toHaveBeenCalledWith(7);
    expect((await labelPhoto.DELETE(req, ctx("9"))).status).toBe(200);
    expect((await del.DELETE(req, ctx("abc"))).status).toBe(404);
    state.ok = false;
    expect((await del.DELETE(req, ctx("5"))).status).toBe(404);
  });

  it("delete a bottle only for a signed-in owner", async () => {
    state.user = null;
    expect((await bottle.DELETE(req as never, ctx("3"))).status).toBe(401);
    expect(deleteBottle).not.toHaveBeenCalled();
    state.user = { id: 1 };
    expect((await bottle.DELETE(req as never, ctx("3"))).status).toBe(200);
    expect(deleteBottle).toHaveBeenCalledWith(3);
    state.ok = false;
    expect((await bottle.DELETE(req as never, ctx("3"))).status).toBe(404);
  });
});
