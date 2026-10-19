// PDF 层处理：标记色 → 单 K、多页合并、缩放、页面框、裁切标记、拆分。

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  cmyk,
  decodePDFRawStream,
  rgb,
  type PDFContext,
} from "pdf-lib";
import { mmToPt } from "./paper";

import { MARKER_RGB } from "./marker";

const COLOR_OP = /(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(scn|SCN|sc|SC|rg|RG)(?![A-Za-z])/g;
const near = (a: number, b: number) => Math.abs(a - b) < 0.0015;
const isMarker = (r: number, g: number, b: number) => near(r, MARKER_RGB.r) && near(g, MARKER_RGB.g) && near(b, MARKER_RGB.b);

/**
 * 替换内容流里的标记色。被替换后色彩空间会变成 DeviceCMYK，
 * 所以之后的三分量 scn/SCN 前面要重新设一次原来的色彩空间（csName）。
 */
export function rewriteMarkerOps(content: string, csName: string | null): { text: string; count: number } {
  let count = 0;
  const text = content.replace(COLOR_OP, (m, r, g, b, op: string) => {
    if (isMarker(+r, +g, +b)) {
      count++;
      return op === op.toLowerCase() ? "0 0 0 1 k" : "0 0 0 1 K";
    }
    return m;
  });
  if (!count || !csName) return { text, count };
  // 第二遍：给保留下来的三分量 scn/SCN 补上色彩空间
  const fixed = text.replace(COLOR_OP, (m, _r, _g, _b, op: string) => {
    if (op === "scn" || op === "sc") return `/${csName} cs ${m}`;
    if (op === "SCN" || op === "SC") return `/${csName} CS ${m}`;
    return m;
  });
  return { text: fixed, count };
}

const latin1 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return s;
};
const fromLatin1 = (s: string) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
};

function rgbColorSpaceName(ctx: PDFContext, resources: PDFDict | undefined): string | null {
  const cs = resources?.lookupMaybe(PDFName.of("ColorSpace"), PDFDict);
  if (!cs) return null;
  let fallback: string | null = null;
  for (const [key, value] of cs.entries()) {
    const name = key.asString().slice(1);
    fallback ??= name;
    const arr = ctx.lookup(value);
    if (arr instanceof PDFArray && arr.size() >= 2) {
      const kind = arr.lookup(0);
      const prof = arr.lookup(1);
      if (kind instanceof PDFName && kind.asString() === "/ICCBased" && prof instanceof PDFStream) {
        const n = prof.dict.lookup(PDFName.of("N"));
        if (n instanceof PDFNumber && n.asNumber() === 3) return name;
      }
    }
  }
  return fallback;
}

function rewriteStream(ctx: PDFContext, ref: PDFRef, csName: string | null): number {
  const stream = ctx.lookup(ref);
  if (!(stream instanceof PDFRawStream)) return 0;
  const decoded = decodePDFRawStream(stream).decode();
  const { text, count } = rewriteMarkerOps(latin1(decoded), csName);
  if (!count) return 0;
  const next = ctx.flateStream(fromLatin1(text));
  for (const [k, v] of stream.dict.entries()) {
    const key = k.asString();
    if (key === "/Filter" || key === "/DecodeParms" || key === "/Length") continue;
    next.dict.set(k, v);
  }
  ctx.assign(ref, next);
  return count;
}

/** 在整份 PDF（页面内容和所有 Form XObject）里把标记色替换成单 K，返回替换次数。 */
export async function markerToK(bytes: Uint8Array): Promise<{ bytes: Uint8Array; count: number }> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const ctx = doc.context;
  const seen = new Set<string>();
  let count = 0;

  const walkResources = (resources: PDFDict | undefined) => {
    const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    if (!xobjects) return;
    for (const [, value] of xobjects.entries()) {
      if (!(value instanceof PDFRef) || seen.has(value.toString())) continue;
      seen.add(value.toString());
      const xo = ctx.lookup(value);
      if (!(xo instanceof PDFRawStream)) continue;
      const subtype = xo.dict.lookup(PDFName.of("Subtype"));
      if (!(subtype instanceof PDFName) || subtype.asString() !== "/Form") continue;
      const res = xo.dict.lookupMaybe(PDFName.of("Resources"), PDFDict) ?? resources;
      count += rewriteStream(ctx, value, rgbColorSpaceName(ctx, res));
      walkResources(res);
    }
  };

  for (const page of doc.getPages()) {
    const resources = page.node.Resources();
    const cs = rgbColorSpaceName(ctx, resources);
    const contents = page.node.get(PDFName.of("Contents"));
    const refs: PDFRef[] = [];
    if (contents instanceof PDFRef) {
      const c = ctx.lookup(contents);
      if (c instanceof PDFArray) c.asArray().forEach((x) => x instanceof PDFRef && refs.push(x));
      else refs.push(contents);
    } else if (contents instanceof PDFArray) {
      contents.asArray().forEach((x) => x instanceof PDFRef && refs.push(x));
    }
    for (const r of refs) count += rewriteStream(ctx, r, cs);
    walkResources(resources);
  }
  if (!count) return { bytes, count };
  return { bytes: await doc.save({ useObjectStreams: false }), count };
}

export interface PagePlacement {
  /** 单页 PDF（Figma 导出，已含 contentBleed 范围） */
  bytes: Uint8Array;
  /** 内容缩放倍数 */
  scale: number;
  /** 成品尺寸（pt） */
  trimW: number;
  trimH: number;
  /** 内容在成品框内的偏移（居中留白） */
  offsetX: number;
  offsetY: number;
  /** 导出内容自带的出血（按输出尺寸计，pt） */
  contentBleed: number;
}

export interface MergeOptions {
  /** 出血（pt），0 = 不写出血框 */
  bleed: number;
  cropMarks: boolean;
  /** 裁切标记颜色：CMYK 用套准色 */
  markColor: "rgb" | "cmyk";
  title?: string;
}

export const CROP_MARK_LENGTH = mmToPt(5);
export const CROP_MARK_GAP_MIN = mmToPt(3);

export function cropMarkMargin(bleed: number): number {
  return Math.max(bleed, CROP_MARK_GAP_MIN) + CROP_MARK_LENGTH + mmToPt(1);
}

export async function mergePages(pages: PagePlacement[], opts: MergeOptions): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setProducer("Folio");
  out.setCreator("Folio · Figma 插件");
  if (opts.title) out.setTitle(opts.title);
  const b = opts.bleed;
  const m = opts.cropMarks ? cropMarkMargin(b) - b : 0;

  for (const p of pages) {
    const src = await PDFDocument.load(p.bytes, { updateMetadata: false });
    const W = p.trimW + 2 * b + 2 * m;
    const H = p.trimH + 2 * b + 2 * m;
    const simple = m === 0 && Math.abs(p.scale - 1) < 1e-6 && p.offsetX < 0.01 && p.offsetY < 0.01 && Math.abs(p.contentBleed - b) < 0.01;
    let page;
    if (simple) {
      [page] = await out.copyPages(src, [0]);
      out.addPage(page);
      page.setMediaBox(0, 0, W, H);
      page.setCropBox(0, 0, W, H);
    } else {
      const [emb] = await out.embedPdf(src, [0]);
      page = out.addPage([W, H]);
      const x = m + b + p.offsetX - p.contentBleed;
      const y = m + b + p.offsetY - p.contentBleed;
      page.drawPage(emb, { x, y, xScale: p.scale, yScale: p.scale });
    }
    page.setTrimBox(m + b, m + b, p.trimW, p.trimH);
    page.setBleedBox(m, m, p.trimW + 2 * b, p.trimH + 2 * b);
    if (opts.cropMarks) drawCropMarks(page, m + b, p.trimW, p.trimH, b, opts.markColor);
  }
  return out.save();
}

type Page = ReturnType<PDFDocument["addPage"]>;

function drawCropMarks(page: Page, origin: number, w: number, h: number, bleed: number, mode: "rgb" | "cmyk") {
  const color = mode === "cmyk" ? cmyk(1, 1, 1, 1) : rgb(0, 0, 0);
  const gap = Math.max(bleed, CROP_MARK_GAP_MIN);
  const L = CROP_MARK_LENGTH;
  const xs = [origin, origin + w];
  const ys = [origin, origin + h];
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.25, color });
  for (const x of xs) {
    for (const y of ys) {
      const dx = x === origin ? -1 : 1;
      const dy = y === origin ? -1 : 1;
      // 水平标记：在成品线延长方向，离开出血区
      line(x + dx * gap, y, x + dx * (gap + L), y);
      // 垂直标记
      line(x, y + dy * gap, x, y + dy * (gap + L));
    }
  }
}

/** 把多页 PDF 拆成单页，保留页面框。 */
export async function splitPages(bytes: Uint8Array): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(bytes, { updateMetadata: false });
  const out: Uint8Array[] = [];
  for (let i = 0; i < src.getPageCount(); i++) {
    const doc = await PDFDocument.create();
    doc.setProducer("Folio");
    const [p] = await doc.copyPages(src, [i]);
    doc.addPage(p);
    out.push(await doc.save());
  }
  return out;
}
