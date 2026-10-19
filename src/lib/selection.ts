// 选区解析（PRD F1）：只接受 Frame；Section 递归展开；识别容器 Frame 展开为多页；去重；按画布位置排序。
// 只依赖最小节点接口，便于在 Node 里做单元测试。

import { matchPaper } from "./paper";

export interface SelNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  /** 画布绝对坐标与尺寸 */
  x: number;
  y: number;
  width: number;
  height: number;
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID";
  children?: readonly SelNode[];
}

export interface Expansion {
  id: string;
  name: string;
  count: number;
  /** "container" = 容器 Frame（可改为单页导出），"section" = Section */
  kind: "container" | "section";
}

export interface ParsedSelection {
  frames: SelNode[];
  expansions: Expansion[];
  ignored: { count: number; types: string[] };
}

const SIZE_EPS = 0.5;

export function isContainerFrame(node: SelNode): boolean {
  if (node.type !== "FRAME") return false;
  const kids = (node.children ?? []).filter((c) => c.visible);
  if (kids.length < 2) return false;
  if (!kids.every((c) => c.type === "FRAME")) return false;
  if (node.layoutMode && node.layoutMode !== "NONE") return true;
  const first = kids[0];
  const uniform = kids.every(
    (c) => Math.abs(c.width - first.width) < SIZE_EPS && Math.abs(c.height - first.height) < SIZE_EPS,
  );
  if (uniform) return true;
  return !matchPaper(node.width, node.height);
}

/**
 * @param singles 用户选择“作为单页导出”的容器 Frame id
 */
export function parseSelection(selection: readonly SelNode[], singles: ReadonlySet<string> = new Set()): ParsedSelection {
  const frames = new Map<string, SelNode>();
  const expansions: Expansion[] = [];
  const ignoredTypes = new Set<string>();
  let ignored = 0;

  const addFrame = (node: SelNode) => {
    if (isContainerFrame(node)) {
      const kids = (node.children ?? []).filter((c) => c.visible);
      if (!singles.has(node.id)) {
        const before = frames.size;
        for (const k of kids) addFrame(k);
        expansions.push({ id: node.id, name: node.name, count: frames.size - before, kind: "container" });
        return;
      }
      expansions.push({ id: node.id, name: node.name, count: 1, kind: "container" });
    }
    frames.set(node.id, node);
  };

  const visit = (node: SelNode, top: boolean) => {
    if (!node.visible && !top) return;
    if (node.type === "SECTION") {
      const before = frames.size;
      for (const c of node.children ?? []) {
        if (c.type === "FRAME" || c.type === "SECTION") visit(c, false);
      }
      if (top) expansions.push({ id: node.id, name: node.name, count: frames.size - before, kind: "section" });
      return;
    }
    if (node.type === "FRAME") {
      addFrame(node);
      return;
    }
    if (top) {
      ignored++;
      ignoredTypes.add(node.type);
    }
  };

  for (const n of selection) visit(n, true);
  return {
    frames: sortByCanvasPosition([...frames.values()]),
    expansions,
    ignored: { count: ignored, types: [...ignoredTypes] },
  };
}

/** 从上到下、从左到右。垂直方向重叠过半的视为同一行。 */
export function sortByCanvasPosition<T extends { x: number; y: number; height: number }>(items: T[]): T[] {
  const byY = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: { top: number; bottom: number; items: T[] }[] = [];
  for (const it of byY) {
    const row = rows[rows.length - 1];
    if (row) {
      const overlap = Math.min(row.bottom, it.y + it.height) - Math.max(row.top, it.y);
      const minH = Math.min(row.bottom - row.top, it.height);
      if (overlap > minH / 2) {
        row.items.push(it);
        row.bottom = Math.max(row.bottom, it.y + it.height);
        continue;
      }
    }
    rows.push({ top: it.y, bottom: it.y + it.height, items: [it] });
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.x - b.x));
}

const TYPE_LABELS: Record<string, string> = {
  GROUP: "编组",
  IMAGE: "图片",
  RECTANGLE: "矩形",
  TEXT: "文字",
  COMPONENT: "组件",
  COMPONENT_SET: "组件集",
  INSTANCE: "实例",
  VECTOR: "矢量",
  ELLIPSE: "椭圆",
  LINE: "线条",
  POLYGON: "多边形",
  STAR: "星形",
  BOOLEAN_OPERATION: "布尔组",
  SLICE: "切片",
};

export function describeIgnoredTypes(types: string[]): string {
  const labels = [...new Set(types.map((t) => TYPE_LABELS[t] ?? "其他"))];
  return labels.slice(0, 3).join("、");
}
