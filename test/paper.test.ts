import { describe, expect, it } from "vitest";
import { formatPaperSize, matchPaper, mmToPt, nearestPaper, planFit, suggestPaper } from "../src/lib/paper";

describe("paper", () => {
  it("matches A4 in both orientations within 1mm", () => {
    expect(matchPaper(595.276, 841.89)?.id).toBe("A4");
    expect(matchPaper(841.89, 595.276)?.id).toBe("A4");
    expect(matchPaper(mmToPt(211), mmToPt(298))?.id).toBe("A4");
    expect(matchPaper(mmToPt(213), mmToPt(297))).toBeUndefined();
  });
  it("formats size", () => {
    expect(formatPaperSize(595.276, 841.89)).toBe("A4 · 210 × 297 mm");
    expect(formatPaperSize(210, 297)).toBe("A7 · 74.1 × 104.8 mm");
  });
  it("suggests A4 when px numbers equal A4 mm numbers", () => {
    expect(suggestPaper(210, 297).id).toBe("A4");
    expect(nearestPaper(210, 297).id).toBe("A7");
  });
  it("plans an aspect-preserving fit", () => {
    const f = planFit(210, 297, suggestPaper(210, 297));
    expect(f.aspectOk).toBe(true);
    expect(f.scale).toBeCloseTo(2.835, 2);
    const g = planFit(300, 300, suggestPaper(210, 297));
    expect(g.aspectOk).toBe(false);
    expect(g.offsetY).toBeGreaterThan(0);
  });
});
