// 按当前设置和每页的缩放选择计算检查提示（PRD F3 / F5 / F6）。

import { matchPaper, matchPaperByPxAsMm, mmToPt, paperById, planFit, suggestPaper, type Paper } from "../lib/paper";
import { PPI_SEVERE, PPI_WARN } from "../lib/ppi";
import type { Issue, PageInfo, Settings } from "../shared/messages";

export const MIN_STROKE_PT = 0.25;
export const MIN_FONT_PT = 5;

export interface PageFix {
  mode: "keep" | "fit";
  paperId: string;
}

export interface PagePlan {
  scale: number;
  trimW: number;
  trimH: number;
  offsetX: number;
  offsetY: number;
  /** 输出尺寸下内容自带的出血 */
  contentBleed: number;
  /** Frame 坐标系下需要导出的出血 */
  bleedSrc: number;
  paper?: Paper;
  /** 宽高比不一致，居中留白 */
  letterbox: boolean;
}

export const bleedPt = (s: Settings) => (s.bleedOn ? mmToPt(Math.max(0, s.bleedMm)) : 0);

export function defaultFix(page: PageInfo): PageFix {
  return { mode: "keep", paperId: suggestPaper(page.width, page.height).id };
}

export function pagePlan(page: PageInfo, fix: PageFix | undefined, settings: Settings): PagePlan {
  const b = bleedPt(settings);
  const paper = fix?.mode === "fit" ? paperById(fix.paperId) : undefined;
  if (!paper) {
    return { scale: 1, trimW: page.width, trimH: page.height, offsetX: 0, offsetY: 0, contentBleed: b, bleedSrc: b, letterbox: false };
  }
  const f = planFit(page.width, page.height, paper);
  const letterbox = !f.aspectOk;
  const contentBleed = letterbox ? 0 : b;
  return {
    scale: f.scale,
    trimW: f.targetW,
    trimH: f.targetH,
    offsetX: f.offsetX,
    offsetY: f.offsetY,
    contentBleed,
    bleedSrc: contentBleed / f.scale,
    paper,
    letterbox,
  };
}

/**
 * 尺寸提示：不是常见纸张；或者 px 数值恰好等于某个更大纸张的 mm 数值
 * （210 × 297 px 只有 A7 大小，多半是想做 A4）。
 */
export function sizeConcern(page: PageInfo): string | null {
  const matched = matchPaper(page.width, page.height);
  const pxAsMm = matchPaperByPxAsMm(page.width, page.height);
  if (pxAsMm && pxAsMm.id !== matched?.id) return matched ? `仅 ${matched.label} 大小` : "尺寸偏小";
  return matched ? null : "非标尺寸";
}

export function pageIssues(page: PageInfo, fix: PageFix | undefined, settings: Settings): Issue[] {
  const plan = pagePlan(page, fix, settings);
  const s = plan.scale;
  const out: Issue[] = [];

  const size = sizeConcern(page);
  if (!plan.paper && size) out.push({ kind: "size", level: "warn", short: size });

  let worst: Issue | null = null;
  for (const img of page.images) {
    const ppi = img.ppi / s;
    if (ppi >= PPI_WARN) continue;
    const issue: Issue = {
      kind: "ppi",
      level: ppi < PPI_SEVERE ? "severe" : "warn",
      short: `${Math.round(ppi)} ppi`,
      nodeId: img.nodeId,
      nodeName: img.nodeName,
      imageW: img.imageW,
      imageH: img.imageH,
      ppi,
    };
    out.push(issue);
    if (!worst || ppi < (worst.ppi ?? Infinity)) worst = issue;
  }

  if (page.minStroke !== null && page.minStroke * s < MIN_STROKE_PT) {
    out.push({ kind: "hairline", level: "warn", short: "细线", value: page.minStroke * s, nodeId: page.minStrokeNode?.id, nodeName: page.minStrokeNode?.name });
  }
  if (page.minFont !== null && page.minFont * s < MIN_FONT_PT) {
    out.push({ kind: "font", level: "warn", short: "小字", value: page.minFont * s, nodeId: page.minFontNode?.id, nodeName: page.minFontNode?.name });
  }

  const b = plan.contentBleed;
  if (b > 0) {
    const bad = page.edgeNodes.filter((n) => n.overhang * s < b - 0.5);
    if (bad.length) out.push({ kind: "edge", level: "warn", short: "贴边", count: bad.length, nodeId: bad[0].id, nodeName: bad[0].name });
  }

  // 同一页多张低分辨率图片，只保留最差的那张作为一条提示
  const ppiIssues = out.filter((i) => i.kind === "ppi");
  if (ppiIssues.length > 1 && worst) {
    const others = ppiIssues.length - 1;
    worst.count = others + 1;
    return out.filter((i) => i.kind !== "ppi" || i === worst);
  }
  return out;
}

/** 行尾标签：最需要关注的那条 */
export function headlineIssue(issues: Issue[]): Issue | undefined {
  const order = ["ppi", "size", "edge", "hairline", "font"];
  return [...issues].sort((a, b) => (a.level === b.level ? order.indexOf(a.kind) - order.indexOf(b.kind) : a.level === "severe" ? -1 : 1))[0];
}

const pageList = (nums: number[]) => {
  const head = nums.slice(0, 6).join("、");
  return nums.length > 6 ? `${head} 等 ${nums.length} ` : head;
};

/** 报告页 / 导出前汇总用的文字 */
export function summarizeIssues(all: { index: number; issues: Issue[] }[]): string[] {
  const by = (kind: Issue["kind"]) => all.filter((p) => p.issues.some((i) => i.kind === kind)).map((p) => p.index + 1);
  const lines: string[] = [];
  const ppi = by("ppi");
  if (ppi.length) lines.push(`第 ${pageList(ppi)} 页的图片低于 300 ppi，印刷可能偏模糊。建议换成更高清的原图。`);
  const size = by("size");
  if (size.length) lines.push(`第 ${pageList(size)} 页不是常见纸张尺寸，请确认这是你要的成品尺寸。`);
  const edge = by("edge");
  if (edge.length) lines.push(`第 ${pageList(edge)} 页有贴边元素没有延伸到出血区，裁切后可能露白。`);
  const hair = by("hairline");
  if (hair.length) lines.push(`第 ${pageList(hair)} 页有细于 0.25pt 的线条，可能印不出来。`);
  const font = by("font");
  if (font.length) lines.push(`第 ${pageList(font)} 页有小于 5pt 的文字，印出来可能看不清。`);
  return lines;
}
