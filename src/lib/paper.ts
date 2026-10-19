// 尺寸换算与纸张规格匹配。Figma 导出 PDF 时 1px = 1pt。

export const MM_PER_PT = 25.4 / 72;
export const PT_PER_MM = 72 / 25.4;

export const ptToMm = (pt: number) => pt * MM_PER_PT;
export const mmToPt = (mm: number) => mm * PT_PER_MM;

export interface Paper {
  id: string;
  label: string;
  /** 短边、长边，单位 mm */
  w: number;
  h: number;
}

export const PAPERS: Paper[] = [
  { id: "A3", label: "A3", w: 297, h: 420 },
  { id: "A4", label: "A4", w: 210, h: 297 },
  { id: "A5", label: "A5", w: 148, h: 210 },
  { id: "A6", label: "A6", w: 105, h: 148 },
  { id: "A7", label: "A7", w: 74, h: 105 },
  { id: "B4", label: "B4", w: 250, h: 353 },
  { id: "B5", label: "B5", w: 176, h: 250 },
  { id: "JIS-B4", label: "JIS B4", w: 257, h: 364 },
  { id: "JIS-B5", label: "JIS B5", w: 182, h: 257 },
  { id: "DD8", label: "大度 8 开", w: 285, h: 420 },
  { id: "DD16", label: "大度 16 开", w: 210, h: 285 },
  { id: "DD32", label: "大度 32 开", w: 140, h: 203 },
  { id: "ZD8", label: "正度 8 开", w: 260, h: 370 },
  { id: "ZD16", label: "正度 16 开", w: 185, h: 260 },
  { id: "ZD32", label: "正度 32 开", w: 130, h: 184 },
  { id: "CARD", label: "名片", w: 54, h: 90 },
  { id: "LETTER", label: "Letter", w: 215.9, h: 279.4 },
];

export const SIZE_TOLERANCE_MM = 1;
export const ASPECT_TOLERANCE = 0.01;

export function paperById(id: string): Paper | undefined {
  return PAPERS.find((p) => p.id === id);
}

/** 按方向返回纸张尺寸（mm），横向 Frame 匹配横向纸张。 */
export function orientPaper(p: Paper, landscape: boolean): { w: number; h: number } {
  return landscape ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

/** 在 ±1mm 容差内匹配纸张，宽高可互换（横版）。 */
export function matchPaper(widthPt: number, heightPt: number): Paper | undefined {
  const a = ptToMm(Math.min(widthPt, heightPt));
  const b = ptToMm(Math.max(widthPt, heightPt));
  return PAPERS.find(
    (p) => Math.abs(p.w - a) <= SIZE_TOLERANCE_MM && Math.abs(p.h - b) <= SIZE_TOLERANCE_MM,
  );
}

/**
 * 新手常见坑：按纸张毫米数画了像素尺寸（210 × 297 px），导出后只有 74 × 105 mm。
 * 返回 px 数值与 mm 数值吻合的纸张。
 */
export function matchPaperByPxAsMm(widthPx: number, heightPx: number): Paper | undefined {
  const a = Math.min(widthPx, heightPx);
  const b = Math.max(widthPx, heightPx);
  return PAPERS.find(
    (p) => Math.abs(p.w - a) <= SIZE_TOLERANCE_MM && Math.abs(p.h - b) <= SIZE_TOLERANCE_MM,
  );
}

/** 为非标尺寸推荐一个目标纸张：px 当 mm 画的优先，其次选宽高比最接近、面积最接近的。 */
export function suggestPaper(widthPt: number, heightPt: number): Paper {
  const byPx = matchPaperByPxAsMm(widthPt, heightPt);
  if (byPx) return byPx;
  const ratio = Math.min(widthPt, heightPt) / Math.max(widthPt, heightPt);
  const area = ptToMm(widthPt) * ptToMm(heightPt);
  let best = PAPERS[1];
  let bestScore = Infinity;
  for (const p of PAPERS) {
    const r = p.w / p.h;
    const score = Math.abs(r - ratio) * 10 + Math.abs(Math.log((p.w * p.h) / area));
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

export interface FitPlan {
  /** 内容缩放倍数 */
  scale: number;
  /** 宽高比是否在 1% 以内（可以等比铺满） */
  aspectOk: boolean;
  /** 目标成品尺寸（pt） */
  targetW: number;
  targetH: number;
  /** 内容在成品框内的偏移（居中留白时为正，铺满时为极小的负值） */
  offsetX: number;
  offsetY: number;
}

export function planFit(widthPt: number, heightPt: number, paper: Paper): FitPlan {
  const landscape = widthPt > heightPt;
  const o = orientPaper(paper, landscape);
  const targetW = mmToPt(o.w);
  const targetH = mmToPt(o.h);
  const sx = targetW / widthPt;
  const sy = targetH / heightPt;
  const aspectOk = Math.abs(sx / sy - 1) <= ASPECT_TOLERANCE;
  // 宽高比基本一致时按“铺满”取大值，多出的不到 1% 落进出血/裁切区，避免成品边上露白；
  // 不一致时只能居中放置、四周留白。
  const scale = aspectOk ? Math.max(sx, sy) : Math.min(sx, sy);
  return {
    scale,
    aspectOk,
    targetW,
    targetH,
    offsetX: (targetW - widthPt * scale) / 2,
    offsetY: (targetH - heightPt * scale) / 2,
  };
}

const fmt = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1));

export function formatMm(widthPt: number, heightPt: number): string {
  return `${fmt(ptToMm(widthPt))} × ${fmt(ptToMm(heightPt))} mm`;
}

export function formatPaperSize(widthPt: number, heightPt: number): string {
  const p = matchPaper(widthPt, heightPt);
  return `${p ? p.label : "非标"} · ${formatMm(widthPt, heightPt)}`;
}

/** 最接近的纸张（不论是否在容差内），用于“≈ A7”这类提示。 */
export function nearestPaper(widthPt: number, heightPt: number): Paper {
  const a = ptToMm(Math.min(widthPt, heightPt));
  const b = ptToMm(Math.max(widthPt, heightPt));
  let best = PAPERS[0];
  let bestD = Infinity;
  for (const p of PAPERS) {
    const d = Math.abs(p.w - a) + Math.abs(p.h - b);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
