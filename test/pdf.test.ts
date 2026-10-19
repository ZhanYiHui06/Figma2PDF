import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { runGs } from "../src/lib/gs";
import { markerToK, mergePages, rewriteMarkerOps, splitPages } from "../src/lib/pdf";
import { mmToPt } from "../src/lib/paper";

/** 模拟 Figma 导出：ICCBased sRGB 色彩空间 + Form XObject 里的 scn 颜色 */
async function figmaLikePdf(w = 200, h = 300): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const icc = ctx.register(ctx.flateStream(new Uint8Array(16), { N: 3 }));
  const cs = ctx.obj({ CS0: ctx.obj([PDFName.of("ICCBased"), icc]) });
  const form = ctx.flateStream(
    "/CS0 cs 0.003922 0.007843 0.011765 scn 0 0 10 10 re f 0.125490 0.137255 0.137255 scn 0 0 50 50 re f 0.003922 0.007843 0.011765 SCN 1 w 0 0 m 5 5 l S",
    { Type: "XObject", Subtype: "Form", BBox: [0, 0, w, h], Resources: ctx.obj({ ColorSpace: cs }) },
  );
  const formRef = ctx.register(form);
  const page = doc.addPage([w, h]);
  page.node.set(PDFName.of("Resources"), ctx.obj({ XObject: ctx.obj({ X0: formRef }), ColorSpace: cs }));
  page.node.set(PDFName.of("Contents"), ctx.register(ctx.flateStream("q /X0 Do Q")));
  return doc.save();
}

async function allContent(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  let s = "";
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && !obj.dict.has(PDFName.of("N"))) {
      try { s += Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1") + "\n"; } catch { /* 图片 */ }
    }
  }
  return s;
}

describe("marker → K", () => {
  it("rewrites marker ops and restores the colour space for later scn", () => {
    const r = rewriteMarkerOps("/CS0 cs 0.003922 0.007843 0.011765 scn f 0.5 0.5 0.5 scn f", "CS0");
    expect(r.count).toBe(1);
    expect(r.text).toBe("/CS0 cs 0 0 0 1 k f /CS0 cs 0.5 0.5 0.5 scn f");
  });
  it("rewrites inside form xobjects of a Figma-like PDF", async () => {
    const { bytes, count } = await markerToK(await figmaLikePdf());
    expect(count).toBe(2);
    const c = await allContent(bytes);
    expect(c).toContain("0 0 0 1 k");
    expect(c).toContain("0 0 0 1 K");
    expect(c).toContain("/CS0 cs 0.125490 0.137255 0.137255 scn");
  });
});

describe("merge", () => {
  it("writes trim and bleed boxes and scales content", async () => {
    const b = mmToPt(3);
    const src = await figmaLikePdf(210 + 2 * (b / 2), 297 + 2 * (b / 2));
    const out = await mergePages(
      [
        { bytes: src, scale: 2, trimW: 420, trimH: 594, offsetX: 0, offsetY: 0, contentBleed: b },
        { bytes: await figmaLikePdf(200 + 2 * b, 300 + 2 * b), scale: 1, trimW: 200, trimH: 300, offsetX: 0, offsetY: 0, contentBleed: b },
      ],
      { bleed: b, cropMarks: false, markColor: "rgb" },
    );
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    const p = doc.getPage(0);
    expect(p.getTrimBox()).toMatchObject({ x: b, y: b, width: 420, height: 594 });
    expect(p.getBleedBox()).toMatchObject({ x: 0, y: 0 });
    expect(p.getMediaBox().width).toBeCloseTo(420 + 2 * b);
    const parts = await splitPages(out);
    expect(parts).toHaveLength(2);
    expect((await PDFDocument.load(parts[1])).getPage(0).getTrimBox().width).toBeCloseTo(200);
  });
  it("adds a margin for crop marks", async () => {
    const out = await mergePages(
      [{ bytes: await figmaLikePdf(), scale: 1, trimW: 200, trimH: 300, offsetX: 0, offsetY: 0, contentBleed: 0 }],
      { bleed: 0, cropMarks: true, markColor: "cmyk" },
    );
    const p = (await PDFDocument.load(out)).getPage(0);
    expect(p.getMediaBox().width).toBeGreaterThan(200 + 2 * mmToPt(8));
    expect(p.getTrimBox().width).toBeCloseTo(200);
  });
});

describe("ghostscript CMYK", () => {
  it("converts to DeviceCMYK, keeps 0 0 0 1 k and page boxes", async () => {
    const require = createRequire(import.meta.url);
    const wasm = readFileSync(require.resolve("@okathira/ghostpdl-wasm/gs.wasm"));
    const { bytes } = await markerToK(await figmaLikePdf());
    const merged = await mergePages(
      [{ bytes, scale: 1, trimW: 200 - 2 * 8.5, trimH: 300 - 2 * 8.5, offsetX: 0, offsetY: 0, contentBleed: 8.5 }],
      { bleed: 8.5, cropMarks: false, markColor: "cmyk" },
    );
    const { pdf } = await runGs(wasm, { pdf: merged });
    const c = await allContent(pdf);
    expect(c).toMatch(/0 0 0 1 k/);
    expect(c).not.toMatch(/\bscn\b|\brg\b/);
    const p = (await PDFDocument.load(pdf)).getPage(0);
    expect(p.getTrimBox().width).toBeCloseTo(183, 0);
  });
});

describe("ICC probe", () => {
  it("rejects a profile Ghostscript cannot read", async () => {
    const { probeIcc } = await import("../src/lib/gs");
    const { fakeIcc } = await import("./helpers");
    const require = createRequire(import.meta.url);
    const wasm = readFileSync(require.resolve("@okathira/ghostpdl-wasm/gs.wasm"));
    expect(await probeIcc(wasm, fakeIcc("CMYK", "prtr", { v2: "fake" }))).toBe(false);
  });
});

describe("tiny probe PDF", () => {
  it("converts without repair warnings", async () => {
    const { runGs, tinyPdf } = await import("../src/lib/gs");
    const wasm = readFileSync(createRequire(import.meta.url).resolve("@okathira/ghostpdl-wasm/gs.wasm"));
    const { log } = await runGs(wasm, { pdf: tinyPdf() });
    expect(log).not.toMatch(/error/i);
  });
});
