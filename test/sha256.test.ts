import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Sync } from "../src/lib/sha256";

describe("sha256", () => {
  it("matches node crypto across block boundaries", () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 1000, 70000]) {
      const d = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 0xff);
      expect(sha256Sync(d)).toBe(createHash("sha256").update(d).digest("hex"));
    }
  });
});
