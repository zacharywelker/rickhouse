import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// images.ts imports server-only, which refuses to load outside the server build.
vi.mock("server-only", () => ({}));

type Images = typeof import("../images");
let images: Images;
let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "rickhouse-minsize-"));
  vi.stubEnv("UPLOAD_DIR", root);
  vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/unused");
  vi.stubEnv("SESSION_SECRET", "x".repeat(40));
  images = await import("../images");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 120, g: 80, b: 40 } } })
    .png()
    .toBuffer();

async function filesUnderRoot(): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

describe("longSideError", () => {
  it("names the size found when the long side is under the minimum", () => {
    expect(images.longSideError(284, 213, 600)).toBe(
      "That image is 284 × 213 px. Photos need at least 600 px on the long side.",
    );
    expect(images.longSideError(599, 599, 600)).toBe(
      "That image is 599 × 599 px. Photos need at least 600 px on the long side.",
    );
  });

  it("accepts an image whose long side reaches the minimum, either way round", () => {
    expect(images.longSideError(600, 100, 600)).toBeNull();
    expect(images.longSideError(100, 600, 600)).toBeNull();
    expect(images.longSideError(900, 700, 600)).toBeNull();
  });
});

describe("storeBottleImageBytes with a minimum long side", () => {
  it("refuses a 300×200 image before writing anything", async () => {
    await expect(images.storeBottleImageBytes(await png(300, 200), "image/png", { minLongSide: 600 })).rejects.toThrow(
      "That image is 300 × 200 px. Photos need at least 600 px on the long side.",
    );
    expect(await filesUnderRoot()).toEqual([]);
  });

  it("stores the same image when no minimum is asked for", async () => {
    const stored = await images.storeBottleImageBytes(await png(300, 200), "image/png");
    expect(stored.filePath).toMatch(/\.webp$/);
  });

  it("stores a 900×700 image under the minimum", async () => {
    const stored = await images.storeBottleImageBytes(await png(900, 700), "image/png", {
      minLongSide: images.HOUSEKEEPING_MIN_LONG_SIDE,
    });
    expect(stored.width).toBe(900);
  });
});
