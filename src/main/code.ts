// Folio 主线程：读选区、做检查、导出临时克隆，所有临时节点都在 finally 里删除。

import { MARKER_RGB } from "../lib/marker";
import { effectivePpi } from "../lib/ppi";
import { describeIgnoredTypes, parseSelection, type SelNode } from "../lib/selection";
import {
  DEFAULT_SETTINGS,
  type ExportPageJob,
  type IccEntry,
  type ImageInfo,
  type MainToUi,
  type PageInfo,
  type Settings,
  type UiToMain,
} from "../shared/messages";

const post = (msg: MainToUi) => figma.ui.postMessage(msg);

figma.skipInvisibleInstanceChildren = true;
figma.showUI(__html__, { width: 380, height: 640, themeColors: true });

const KEY_SETTINGS = "settings";
const KEY_ICC_INDEX = "icc:index";
const iccKey = (id: string) => `icc:data:${id}`;

let singles = new Set<string>();
let selectionToken = 0;
let locatedId: string | null = null;

// ---------- 选区 ----------

function absXY(n: SceneNode): { x: number; y: number } {
  const t = n.absoluteTransform;
  return { x: t[0][2], y: t[1][2] };
}

function hasImageFill(n: SceneNode): boolean {
  return "fills" in n && Array.isArray(n.fills) && (n.fills as readonly Paint[]).some((p) => p.type === "IMAGE");
}

function toSelNode(n: SceneNode): SelNode {
  const { x, y } = absXY(n);
  const type = n.type === "RECTANGLE" && hasImageFill(n) ? "IMAGE" : n.type;
  return {
    id: n.id,
    name: n.name,
    type,
    visible: n.visible,
    x,
    y,
    width: n.width,
    height: n.height,
    layoutMode: n.type === "FRAME" ? n.layoutMode : undefined,
    get children() {
      return "children" in n && (n.type === "FRAME" || n.type === "SECTION") ? n.children.map(toSelNode) : undefined;
    },
  };
}

function visibleWithin(n: BaseNode, root: BaseNode): boolean {
  let cur: BaseNode | null = n;
  while (cur && cur !== root) {
    if ("visible" in cur && !cur.visible) return false;
    cur = cur.parent;
  }
  return true;
}

async function analyzePage(frame: FrameNode): Promise<PageInfo> {
  const { x: fx, y: fy } = absXY(frame);
  const W = frame.width;
  const H = frame.height;
  const images = new Map<string, ImageInfo>();
  let minStroke: number | null = null;
  let minStrokeNode: PageInfo["minStrokeNode"];
  let minFont: number | null = null;
  let minFontNode: PageInfo["minFontNode"];
  const edgeNodes: PageInfo["edgeNodes"] = [];

  const nodes: SceneNode[] = [frame, ...frame.findAll(() => true)];
  for (const n of nodes) {
    if (n !== frame && !visibleWithin(n, frame)) continue;

    if ("fills" in n && Array.isArray(n.fills)) {
      for (const p of n.fills as readonly Paint[]) {
        if (p.type !== "IMAGE" || p.visible === false || !p.imageHash) continue;
        const img = figma.getImageByHash(p.imageHash);
        if (!img) continue;
        let size: { width: number; height: number };
        try {
          size = await img.getSizeAsync();
        } catch {
          continue;
        }
        const ppi = effectivePpi({
          nodeW: n.width,
          nodeH: n.height,
          imageW: size.width,
          imageH: size.height,
          scaleMode: p.scaleMode,
          imageTransform: p.imageTransform as unknown as number[][] | undefined,
          scalingFactor: p.scalingFactor,
        });
        const prev = images.get(n.id);
        if (!prev || ppi < prev.ppi) images.set(n.id, { nodeId: n.id, nodeName: n.name, imageW: size.width, imageH: size.height, ppi });
      }
    }

    if ("strokes" in n && n.strokes.some((s) => s.visible !== false) && n.strokeWeight !== 0) {
      let w = n.strokeWeight === figma.mixed ? Infinity : n.strokeWeight;
      if ("strokeTopWeight" in n && n.strokeWeight === figma.mixed) {
        w = Math.min(...[n.strokeTopWeight, n.strokeRightWeight, n.strokeBottomWeight, n.strokeLeftWeight].filter((v) => v > 0));
      }
      if (Number.isFinite(w) && w > 0 && (minStroke === null || w < minStroke)) {
        minStroke = w;
        minStrokeNode = { id: n.id, name: n.name };
      }
    }

    if (n.type === "TEXT" && n.characters.length) {
      const size = n.fontSize === figma.mixed ? Math.min(...n.getStyledTextSegments(["fontSize"]).map((s) => s.fontSize)) : n.fontSize;
      if (minFont === null || size < minFont) {
        minFont = size;
        minFontNode = { id: n.id, name: n.name };
      }
    }

    // 贴边检测：贴着成品边缘、但没有延伸出去（延伸量交给界面按出血宽度判断）
    if (n !== frame && n.type !== "TEXT" && "fills" in n && Array.isArray(n.fills) && (n.fills as readonly Paint[]).some((p) => p.visible !== false)) {
      const b = n.absoluteBoundingBox;
      if (b && edgeNodes.length < 50) {
        const l = b.x - fx, t = b.y - fy, r = b.x + b.width - fx, btm = b.y + b.height - fy;
        const overhangs: number[] = [];
        if (l <= 0.5 && r > 0) overhangs.push(-l);
        if (t <= 0.5 && btm > 0) overhangs.push(-t);
        if (r >= W - 0.5 && l < W) overhangs.push(r - W);
        if (btm >= H - 0.5 && t < H) overhangs.push(btm - H);
        if (overhangs.length) edgeNodes.push({ id: n.id, name: n.name, overhang: Math.min(...overhangs) });
      }
    }
  }

  return {
    id: frame.id,
    name: frame.name,
    width: W,
    height: H,
    images: [...images.values()],
    minStroke,
    minStrokeNode,
    minFont,
    minFontNode,
    edgeNodes,
  };
}

async function refreshSelection() {
  const token = ++selectionToken;
  const sel = figma.currentPage.selection;
  if (locatedId && sel.length === 1 && sel[0].id === locatedId) return;
  locatedId = null;
  const parsed = parseSelection(sel.map(toSelNode), singles);
  const pages: PageInfo[] = [];
  for (const f of parsed.frames) {
    const node = await figma.getNodeByIdAsync(f.id);
    if (token !== selectionToken) return;
    if (node && node.type === "FRAME") pages.push(await analyzePage(node));
  }
  if (token !== selectionToken) return;
  post({
    type: "selection",
    payload: {
      pages,
      expansions: parsed.expansions,
      ignored: { count: parsed.ignored.count, label: describeIgnoredTypes(parsed.ignored.types) },
    },
  });
  for (const p of pages) {
    if (token !== selectionToken) return;
    const node = await figma.getNodeByIdAsync(p.id);
    if (!node || node.type !== "FRAME") continue;
    try {
      const constraint: ExportSettingsConstraints =
        node.width > node.height ? { type: "WIDTH", value: 260 } : { type: "HEIGHT", value: 260 };
      const png = await node.exportAsync({ format: "PNG", constraint });
      if (token !== selectionToken) return;
      post({ type: "thumb", id: p.id, png });
    } catch {
      // 缩略图失败不影响导出
    }
  }
}

let selTimer: ReturnType<typeof setTimeout> | undefined;
figma.on("selectionchange", () => {
  clearTimeout(selTimer);
  selTimer = setTimeout(refreshSelection, 120);
});
figma.on("currentpagechange", () => refreshSelection());

// ---------- 导出 ----------

const isNearBlack = (c: RGB) => {
  const mx = Math.max(c.r, c.g, c.b);
  const mn = Math.min(c.r, c.g, c.b);
  return mx - mn < 0.03 && mx <= 0x33 / 255 + 1e-6;
};

/** 把近黑色文字改成标记色，返回改动的文字段数。只处理文字，背景和色块保持四色黑。 */
async function markBlackText(root: FrameNode): Promise<number> {
  let count = 0;
  for (const t of root.findAllWithCriteria({ types: ["TEXT"] })) {
    if (!t.visible || t.opacity < 0.99 || t.hasMissingFont) continue;
    const segs = t.getStyledTextSegments(["fills", "fontName"]);
    const targets = segs.filter((s) => {
      const vis = s.fills.filter((p) => p.visible !== false);
      return vis.length === 1 && vis[0].type === "SOLID" && (vis[0].opacity ?? 1) >= 0.99 && isNearBlack(vis[0].color);
    });
    if (!targets.length) continue;
    await Promise.all(targets.map((s) => figma.loadFontAsync(s.fontName)));
    for (const s of targets) {
      t.setRangeFills(s.start, s.end, [{ type: "SOLID", color: MARKER_RGB, opacity: 1 }]);
      count++;
    }
  }
  return count;
}

async function exportPage(job: ExportPageJob): Promise<{ pdf: Uint8Array; kCount: number }> {
  const frame = await figma.getNodeByIdAsync(job.id);
  if (!frame || frame.type !== "FRAME") throw new Error("找不到这个 Frame，可能已被删除");
  const temps: SceneNode[] = [];
  try {
    const { x, y } = absXY(frame);
    const clone = frame.clone();
    temps.push(clone);
    figma.currentPage.appendChild(clone);
    clone.x = x;
    clone.y = y;
    clone.effects = [];
    const kCount = job.blackToK ? await markBlackText(clone) : 0;
    let target: FrameNode = clone;
    const b = job.bleedSrc;
    if (b > 0) {
      const box = figma.createFrame();
      temps.push(box);
      box.name = "Folio · 出血";
      box.resize(clone.width + 2 * b, clone.height + 2 * b);
      box.x = x - b;
      box.y = y - b;
      box.fills = clone.fills === figma.mixed ? [] : clone.fills;
      box.clipsContent = true;
      box.appendChild(clone);
      clone.x = b;
      clone.y = b;
      clone.clipsContent = false;
      target = box;
    } else {
      clone.clipsContent = true;
    }
    const pdf = await target.exportAsync({ format: "PDF", useAbsoluteBounds: true });
    return { pdf, kCount };
  } finally {
    for (const t of temps.reverse()) {
      try {
        if (!t.removed) t.remove();
      } catch {
        // 已随父节点删除
      }
    }
  }
}

// ---------- 存储 ----------

async function loadIccIndex(): Promise<IccEntry[]> {
  return ((await figma.clientStorage.getAsync(KEY_ICC_INDEX)) as IccEntry[] | undefined) ?? [];
}

async function loadSettings(): Promise<Settings> {
  const s = (await figma.clientStorage.getAsync(KEY_SETTINGS)) as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

// ---------- 消息 ----------

figma.ui.onmessage = async (msg: UiToMain) => {
  switch (msg.type) {
    case "ready": {
      post({ type: "init", settings: await loadSettings(), iccs: await loadIccIndex() });
      await refreshSelection();
      break;
    }
    case "set-singles":
      singles = new Set(msg.ids);
      await refreshSelection();
      break;
    case "save-settings":
      await figma.clientStorage.setAsync(KEY_SETTINGS, msg.settings);
      break;
    case "resize":
      figma.ui.resize(Math.max(340, Math.round(msg.width)), Math.max(480, Math.round(msg.height)));
      break;
    case "locate": {
      const node = await figma.getNodeByIdAsync(msg.nodeId);
      if (node && "visible" in node) {
        locatedId = node.id;
        figma.currentPage.selection = [node as SceneNode];
        figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
      }
      break;
    }
    case "export-page": {
      try {
        const { pdf, kCount } = await exportPage(msg.job);
        post({ type: "page-pdf", index: msg.index, id: msg.job.id, pdf, kCount });
      } catch (e) {
        post({ type: "page-error", index: msg.index, message: e instanceof Error ? e.message : String(e) });
      }
      break;
    }
    case "export-cancel":
      // 界面停止请求下一页即可；当前页的临时节点会在 finally 里清理
      break;
    case "icc-import": {
      try {
        await figma.clientStorage.setAsync(iccKey(msg.entry.id), msg.data);
        const index = (await loadIccIndex()).filter((e) => e.id !== msg.entry.id);
        index.push(msg.entry);
        await figma.clientStorage.setAsync(KEY_ICC_INDEX, index);
        post({ type: "iccs", iccs: index });
      } catch (e) {
        await figma.clientStorage.deleteAsync(iccKey(msg.entry.id)).catch(() => undefined);
        post({ type: "storage-error", message: "本地空间不足，请先删除不用的配置文件。" });
      }
      break;
    }
    case "icc-delete": {
      await figma.clientStorage.deleteAsync(iccKey(msg.id));
      const index = (await loadIccIndex()).filter((e) => e.id !== msg.id);
      await figma.clientStorage.setAsync(KEY_ICC_INDEX, index);
      post({ type: "iccs", iccs: index });
      break;
    }
    case "icc-load": {
      const data = (await figma.clientStorage.getAsync(iccKey(msg.id))) as Uint8Array | undefined;
      post({ type: "icc-data", requestId: msg.requestId, data: data ?? null });
      break;
    }
    case "open-url":
      figma.openExternal(msg.url);
      break;
  }
};
