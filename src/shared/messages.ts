// 主线程（code.ts）与界面（ui.html）之间的消息。

import type { Expansion } from "../lib/selection";

export type IssueKind = "size" | "ppi" | "edge" | "hairline" | "font";

export interface Issue {
  kind: IssueKind;
  level: "warn" | "severe";
  /** 行尾标签上的短文字，例如 "137 ppi" */
  short: string;
  /** 相关图层，用于“在画布中定位图层” */
  nodeId?: string;
  nodeName?: string;
  /** 图片：原图尺寸、放置后的 ppi（已按缩放计算） */
  imageW?: number;
  imageH?: number;
  ppi?: number;
  /** 细线 / 字号 */
  value?: number;
  /** 贴边元素数量 */
  count?: number;
}

/** 图片放置信息，界面按缩放倍数重新计算 ppi */
export interface ImageInfo {
  nodeId: string;
  nodeName: string;
  imageW: number;
  imageH: number;
  /** scale = 1 时的 ppi */
  ppi: number;
}

export interface PageInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  images: ImageInfo[];
  /** 最细描边（pt），没有描边为 null */
  minStroke: number | null;
  minStrokeNode?: { id: string; name: string };
  /** 最小字号（pt） */
  minFont: number | null;
  minFontNode?: { id: string; name: string };
  /** 贴着成品边缘的元素；overhang = 向外延伸了多少 pt（0 = 刚好贴边） */
  edgeNodes: { id: string; name: string; overhang: number }[];
}

export interface SelectionPayload {
  pages: PageInfo[];
  expansions: Expansion[];
  ignored: { count: number; label: string };
}

export interface IccEntry {
  id: string;
  name: string;
  /** 原始大小（字节） */
  size: number;
  /** 压缩后占用（字节） */
  stored: number;
  importedAt: number;
}

export interface Settings {
  colorMode: "rgb" | "cmyk";
  iccId: string;
  blackToK: boolean;
  bleedOn: boolean;
  bleedMm: number;
  cropMarks: boolean;
  output: "merged" | "zip";
  view: "list" | "grid";
}

export const DEFAULT_SETTINGS: Settings = {
  colorMode: "cmyk",
  iccId: "builtin",
  blackToK: true,
  bleedOn: false,
  bleedMm: 3,
  cropMarks: false,
  output: "merged",
  view: "list",
};

export interface ExportPageJob {
  id: string;
  /** 导出内容自带的出血（Frame 坐标系，pt） */
  bleedSrc: number;
  blackToK: boolean;
}

export type UiToMain =
  | { type: "ready" }
  | { type: "set-singles"; ids: string[] }
  | { type: "save-settings"; settings: Settings }
  | { type: "resize"; width: number; height: number }
  | { type: "locate"; nodeId: string }
  | { type: "export-page"; job: ExportPageJob; index: number }
  | { type: "export-cancel" }
  | { type: "icc-import"; entry: IccEntry; data: Uint8Array }
  | { type: "icc-delete"; id: string }
  | { type: "icc-load"; id: string; requestId: number }
  | { type: "open-url"; url: string };

export type MainToUi =
  | { type: "init"; settings: Settings; iccs: IccEntry[] }
  | { type: "selection"; payload: SelectionPayload }
  | { type: "thumb"; id: string; png: Uint8Array }
  | { type: "page-pdf"; index: number; id: string; pdf: Uint8Array; kCount: number }
  | { type: "page-error"; index: number; message: string }
  | { type: "iccs"; iccs: IccEntry[] }
  | { type: "icc-data"; requestId: number; data: Uint8Array | null }
  | { type: "storage-error"; message: string };
