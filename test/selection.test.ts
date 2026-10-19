import { describe, expect, it } from "vitest";
import { describeIgnoredTypes, isContainerFrame, parseSelection, type SelNode } from "../src/lib/selection";

const frame = (id: string, x: number, y: number, w = 595, h = 842, extra: Partial<SelNode> = {}): SelNode => ({
  id, name: id, type: "FRAME", visible: true, x, y, width: w, height: h, layoutMode: "NONE", children: [], ...extra,
});

describe("selection", () => {
  const pages = Array.from({ length: 16 }, (_, i) => frame(`p${i + 1}`, i * 620, 0));
  const book = frame("book", 0, 0, 10484, 842, { layoutMode: "HORIZONTAL", children: pages });
  const section: SelNode = { id: "s", name: "V2", type: "SECTION", visible: true, x: 0, y: 0, width: 11000, height: 1000, children: [book] };

  it("expands a section containing an auto-layout container into 16 pages", () => {
    const r = parseSelection([section]);
    expect(r.frames.map((f) => f.id)).toEqual(pages.map((p) => p.id));
    expect(r.expansions.find((e) => e.kind === "container")).toMatchObject({ id: "book", count: 16 });
  });
  it("treats a container as a single page on request", () => {
    const r = parseSelection([book], new Set(["book"]));
    expect(r.frames.map((f) => f.id)).toEqual(["book"]);
  });
  it("does not expand a page with a single child frame", () => {
    expect(isContainerFrame(frame("a", 0, 0, 595, 842, { children: [frame("b", 0, 0)] }))).toBe(false);
  });
  it("does not expand an A4 frame whose child frames differ in size", () => {
    const f = frame("a", 0, 0, 595.276, 841.89, { children: [frame("b", 0, 0, 100, 100), frame("c", 0, 0, 200, 50)] });
    expect(isContainerFrame(f)).toBe(false);
  });
  it("dedups, ignores non-frames and sorts top-to-bottom, left-to-right", () => {
    const a = frame("a", 700, 0), b = frame("b", 0, 10), c = frame("c", 0, 1000);
    const g: SelNode = { id: "g", name: "g", type: "GROUP", visible: true, x: 0, y: 0, width: 1, height: 1 };
    const r = parseSelection([c, a, b, a, g]);
    expect(r.frames.map((f) => f.id)).toEqual(["b", "a", "c"]);
    expect(r.ignored.count).toBe(1);
    expect(describeIgnoredTypes(["GROUP", "IMAGE"])).toBe("编组、图片");
  });
});
