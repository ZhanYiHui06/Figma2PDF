// 导出流程：下载引擎 → 逐页导出 → 单 K → 合并/缩放/页面框 → 转 CMYK → 生成文件。

import { zipSync } from "fflate";
import { sanitizeFileName, uniqueNames } from "../lib/filename";
import { matchPaper, ptToMm, formatMm } from "../lib/paper";
import { markerToK, mergePages, splitPages, type PagePlacement } from "../lib/pdf";
import type { IccEntry, Issue, MainToUi, PageInfo, Settings } from "../shared/messages";
import { listen, send } from "./bridge";
import { convertToCmyk } from "./convert";
import { engineReady, loadEngine } from "./engine";
import { loadProfile, needsDownload, presetById } from "./icc-store";
import { bleedPt, pagePlan, summarizeIssues, type PageFix } from "./issues";

export type StepId = "engine" | "profile" | "pages" | "convert" | "file";
export type StepState = "pending" | "active" | "done";

export interface Progress {
  steps: { id: StepId; state: StepState; done: number; total: number }[];
  /** 预计剩余秒数，未知时为 null */
  eta: number | null;
}

export interface ExportJob {
  pages: PageInfo[];
  fixes: Map<string, PageFix>;
  issues: { index: number; issues: Issue[] }[];
  settings: Settings;
  icc: IccEntry;
  baseName: string;
}

export interface ExportResult {
  fileName: string;
  blob: Blob;
  pageCount: number;
  bytes: number;
  sizeText: string;
  colorText: string;
  kText: string;
  bleedText: string;
  remaining: string[];
  remainingCount: number;
}

export class Cancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

function requestPage(index: number, job: { id: string; bleedSrc: number; blackToK: boolean }): Promise<{ pdf: Uint8Array; kCount: number }> {
  return new Promise((resolve, reject) => {
    const off = listen((m: MainToUi) => {
      if (m.type === "page-pdf" && m.index === index) {
        off();
        resolve({ pdf: m.pdf, kCount: m.kCount });
      } else if (m.type === "page-error" && m.index === index) {
        off();
        reject(new Error(m.message));
      }
    });
    send({ type: "export-page", index, job });
  });
}

export function startExport(job: ExportJob, onProgress: (p: Progress) => void): { promise: Promise<ExportResult>; cancel: () => void } {
  const abort = new AbortController();
  let cancelConvert: (() => void) | null = null;
  const cmyk = job.settings.colorMode === "cmyk";
  const n = job.pages.length;

  const steps: Progress["steps"] = [];
  if (cmyk && !engineReady()) steps.push({ id: "engine", state: "pending", done: 0, total: 1 });
  if (cmyk && needsDownload(job.icc.id)) steps.push({ id: "profile", state: "pending", done: 0, total: presetById(job.icc.id)!.size });
  steps.push({ id: "pages", state: "pending", done: 0, total: n });
  if (cmyk) steps.push({ id: "convert", state: "pending", done: 0, total: n });
  steps.push({ id: "file", state: "pending", done: 0, total: 1 });

  let stepStart = Date.now();
  let eta: number | null = null;
  const emit = () => onProgress({ steps: steps.map((s) => ({ ...s })), eta });
  const set = (id: StepId, patch: Partial<Progress["steps"][number]>) => {
    const s = steps.find((x) => x.id === id);
    if (!s) return;
    if (patch.state === "active" && s.state !== "active") stepStart = Date.now();
    Object.assign(s, patch);
    if (s.state === "active" && s.done > 0 && s.total > 0) {
      const per = (Date.now() - stepStart) / s.done;
      const restSteps = steps.filter((x) => x.state === "pending" && (x.id === "convert" || x.id === "pages")).reduce((a, x) => a + x.total, 0);
      eta = Math.max(1, Math.round(((s.total - s.done) * per + restSteps * per * 0.8) / 1000));
    }
    emit();
  };
  const check = () => {
    if (abort.signal.aborted) throw new Cancelled();
  };

  const run = async (): Promise<ExportResult> => {
    emit();
    let wasm: Uint8Array | null = null;
    if (cmyk) {
      set("engine", { state: "active" });
      wasm = await loadEngine((r, t) => set("engine", { done: r, total: t }), abort.signal);
      set("engine", { state: "done" });
    }
    // 先把配置文件准备好：远程的要下载，下载失败就不必再导出页面
    let icc: Uint8Array | undefined;
    if (cmyk) {
      set("profile", { state: "active" });
      icc = await loadProfile(job.icc.id, (r, t) => set("profile", { done: r, total: t }), abort.signal);
      set("profile", { state: "done" });
    }

    set("pages", { state: "active" });
    const placements: PagePlacement[] = [];
    let kSegments = 0;
    let kPages = 0;
    for (let i = 0; i < n; i++) {
      check();
      const page = job.pages[i];
      const plan = pagePlan(page, job.fixes.get(page.id), job.settings);
      const blackToK = cmyk && job.settings.blackToK;
      const res = await requestPage(i, { id: page.id, bleedSrc: plan.bleedSrc, blackToK });
      let bytes = res.pdf;
      if (blackToK && res.kCount > 0) {
        bytes = (await markerToK(bytes)).bytes;
        kSegments += res.kCount;
        kPages++;
      }
      placements.push({ bytes, scale: plan.scale, trimW: plan.trimW, trimH: plan.trimH, offsetX: plan.offsetX, offsetY: plan.offsetY, contentBleed: plan.contentBleed });
      set("pages", { done: i + 1 });
    }
    set("pages", { state: "done" });
    check();

    const merged = await mergePages(placements, {
      bleed: bleedPt(job.settings),
      cropMarks: job.settings.bleedOn && job.settings.cropMarks,
      markColor: cmyk ? "cmyk" : "rgb",
      title: job.baseName,
    });
    check();

    let finalPdf = merged;
    if (cmyk && wasm) {
      set("convert", { state: "active" });
      const handle = convertToCmyk({ wasm: wasm.slice(), pdf: merged, icc }, (p) => set("convert", { done: p }));
      cancelConvert = handle.cancel;
      finalPdf = await handle.promise;
      cancelConvert = null;
      set("convert", { state: "done", done: n });
    }
    check();

    set("file", { state: "active" });
    let blob: Blob;
    let fileName: string;
    if (job.settings.output === "zip") {
      const parts = await splitPages(finalPdf);
      const names = uniqueNames(job.pages.map((p) => p.name), ".pdf");
      const files: Record<string, Uint8Array> = {};
      parts.forEach((p, i) => (files[names[i]] = p));
      blob = new Blob([zipSync(files, { level: 0 }) as Uint8Array<ArrayBuffer>], { type: "application/zip" });
      fileName = `${sanitizeFileName(job.baseName)}.zip`;
    } else {
      blob = new Blob([finalPdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
      fileName = `${sanitizeFileName(job.baseName)}.pdf`;
    }
    set("file", { state: "done", done: 1 });

    return {
      fileName,
      blob,
      pageCount: n,
      bytes: blob.size,
      sizeText: sizeSummary(placements),
      colorText: cmyk ? `CMYK · ${job.icc.name}` : "RGB",
      kText: !cmyk ? "RGB 导出不处理" : !job.settings.blackToK ? "未开启" : kSegments ? `已转单 K · ${kPages} 页 ${kSegments} 处` : "没有需要处理的文字",
      bleedText: job.settings.bleedOn ? `${job.settings.bleedMm} mm · 已写入成品框${job.settings.cropMarks ? " · 裁切标记" : ""}` : "关闭",
      remaining: summarizeIssues(job.issues),
      remainingCount: job.issues.reduce((a, p) => a + p.issues.length, 0),
    };
  };

  const promise = run();
  return {
    promise,
    cancel: () => {
      abort.abort();
      cancelConvert?.();
      send({ type: "export-cancel" });
    },
  };
}

function sizeSummary(pages: PagePlacement[]): string {
  const keys = new Map<string, number>();
  for (const p of pages) {
    const paper = matchPaper(p.trimW, p.trimH);
    const k = `${paper ? paper.label + " · " : ""}${formatMm(p.trimW, p.trimH)}`;
    keys.set(k, (keys.get(k) ?? 0) + 1);
  }
  if (keys.size === 1) {
    const [k, c] = [...keys][0];
    return `${k} × ${c}`;
  }
  return `${keys.size} 种尺寸`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const formatBytes = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export { ptToMm };
