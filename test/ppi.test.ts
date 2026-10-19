import { describe, expect, it } from "vitest";
import { effectivePpi, ppiLevel } from "../src/lib/ppi";

describe("ppi", () => {
  it("matches the spike sample (2400×1600 FILL on A4 = 137 ppi)", () => {
    const p = effectivePpi({ nodeW: 595.276, nodeH: 841.89, imageW: 2400, imageH: 1600, scaleMode: "FILL" });
    expect(Math.round(p)).toBe(137);
    expect(ppiLevel(p)).toBe("severe");
  });
  it("handles FIT, CROP and TILE", () => {
    expect(effectivePpi({ nodeW: 100, nodeH: 100, imageW: 400, imageH: 200, scaleMode: "FIT" })).toBeCloseTo(288);
    const crop = effectivePpi({ nodeW: 100, nodeH: 100, imageW: 1000, imageH: 1000, scaleMode: "CROP", imageTransform: [[0.5, 0, 0.25], [0, 0.5, 0.25]] });
    expect(crop).toBeCloseTo(360);
    expect(effectivePpi({ nodeW: 100, nodeH: 100, imageW: 10, imageH: 10, scaleMode: "TILE", scalingFactor: 0.24 })).toBeCloseTo(300);
  });
  it("accounts for page scaling", () => {
    expect(effectivePpi({ nodeW: 210, nodeH: 297, imageW: 1200, imageH: 1600, scaleMode: "FILL" }, 2.835)).toBeCloseTo(136.8, 0);
  });
});
