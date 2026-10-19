// 拖拽排序：指针事件实现，列表和网格共用。移动超过 4px 才算拖拽，否则当作点击。

import { useEffect, useRef, useState } from "preact/hooks";

export interface DragState {
  id: string;
  /** 浮起元素左上角（client 坐标）与尺寸 */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 插入位置（不含被拖元素的序号） */
  insertAt: number;
  /** 插入指示线（client 坐标） */
  line: { x: number; y: number; w: number; h: number } | null;
}

interface Options {
  ids: string[];
  layout: "list" | "grid";
  container: () => HTMLElement | null;
  onMove: (id: string, insertAt: number) => void;
  onClick: (id: string) => void;
}

export function useDragSort(opts: Options) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const ref = useRef(opts);
  ref.current = opts;
  const session = useRef<{ id: string; sx: number; sy: number; offX: number; offY: number; w: number; h: number; started: boolean } | null>(null);
  const scrollTimer = useRef<number | undefined>(undefined);

  const compute = (s: { id: string }, clientX: number, clientY: number): Pick<DragState, "insertAt" | "line"> => {
    const box = ref.current.container();
    if (!box) return { insertAt: 0, line: null };
    const els = [...box.querySelectorAll<HTMLElement>("[data-id]")].filter((e) => e.dataset.id !== s.id);
    if (!els.length) return { insertAt: 0, line: null };
    const rects = els.map((e) => e.getBoundingClientRect());
    if (ref.current.layout === "list") {
      let i = rects.findIndex((r) => clientY < r.top + r.height / 2);
      if (i < 0) i = rects.length;
      const r = rects[Math.min(i, rects.length - 1)];
      const y = i < rects.length ? r.top : r.bottom;
      return { insertAt: i, line: { x: r.left + 8, y: y - 1, w: r.width - 16, h: 2 } };
    }
    // 网格：找最近的卡片，按左右半边决定插在前面还是后面
    let best = 0;
    let bestD = Infinity;
    rects.forEach((r, i) => {
      const dx = Math.max(r.left - clientX, 0, clientX - r.right);
      const dy = Math.max(r.top - clientY, 0, clientY - r.bottom);
      const d = dx * dx + dy * dy * 4;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const r = rects[best];
    const after = clientX > r.left + r.width / 2;
    const insertAt = best + (after ? 1 : 0);
    const x = after ? r.right + 3 : r.left - 5;
    return { insertAt, line: { x, y: r.top + 6, w: 2, h: r.height - 30 } };
  };

  const autoScroll = (clientY: number) => {
    window.clearInterval(scrollTimer.current);
    const box = ref.current.container();
    if (!box) return;
    const r = box.getBoundingClientRect();
    const edge = 28;
    // 列表顶部被浮动的页面栏盖住（padding-top），滚动热区从它下方算起
    const top = r.top + (parseFloat(getComputedStyle(box).paddingTop) || 0);
    const dir = clientY < top + edge ? -1 : clientY > r.bottom - edge ? 1 : 0;
    if (dir) scrollTimer.current = window.setInterval(() => (box.scrollTop += dir * 8), 16);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = session.current;
      if (!s) return;
      if (!s.started) {
        if (Math.hypot(e.clientX - s.sx, e.clientY - s.sy) < 4) return;
        s.started = true;
      }
      autoScroll(e.clientY);
      setDrag({ id: s.id, x: e.clientX - s.offX, y: e.clientY - s.offY, w: s.w, h: s.h, ...compute(s, e.clientX, e.clientY) });
    };
    const up = (e: PointerEvent) => {
      const s = session.current;
      if (!s) return;
      session.current = null;
      window.clearInterval(scrollTimer.current);
      if (s.started) {
        const { insertAt } = compute(s, e.clientX, e.clientY);
        ref.current.onMove(s.id, insertAt);
      } else {
        ref.current.onClick(s.id);
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  /** 绑在拖拽起点上（列表的手柄、网格的整张卡片） */
  const start = (id: string, e: PointerEvent, itemEl: HTMLElement | null) => {
    if (e.button !== 0 || !itemEl) return;
    e.preventDefault();
    const r = itemEl.getBoundingClientRect();
    session.current = { id, sx: e.clientX, sy: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, w: r.width, h: r.height, started: false };
  };

  return { drag, start };
}

export function moveId(ids: string[], id: string, insertAt: number): string[] {
  const rest = ids.filter((x) => x !== id);
  rest.splice(Math.max(0, Math.min(insertAt, rest.length)), 0, id);
  return rest;
}
