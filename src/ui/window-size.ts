// 插件窗口尺寸。figma.ui.resize 本身没有过渡，这里逐帧发 resize，做出伸缩动画。

import { send } from "./bridge";

const DURATION = 320;
// ease-out-quart：起步快、收尾慢，和界面里其它动效的曲线一致
const ease = (t: number) => 1 - Math.pow(1 - t, 4);

let frame: number | null = null;
/** 自动拉高前的高度；用户手动拖过窗口后清空，不再自动缩回 */
let grownFrom: number | null = null;

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function stop() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
}

export function animateHeight(target: number) {
  stop();
  const width = window.innerWidth;
  const from = window.innerHeight;
  if (Math.abs(target - from) < 2 || reducedMotion()) {
    send({ type: "resize", width, height: target });
    return;
  }
  const start = performance.now();
  let last = from;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / DURATION);
    const h = Math.round(from + (target - from) * ease(t));
    if (h !== last) send({ type: "resize", width, height: h });
    last = h;
    frame = t < 1 ? requestAnimationFrame(step) : null;
  };
  frame = requestAnimationFrame(step);
}

/** 展开设置时窗口太矮就拉高一些 */
export function growFor(minHeight: number, height: number) {
  if (window.innerHeight >= minHeight) return;
  grownFrom ??= window.innerHeight;
  animateHeight(height);
}

/** 设置全部收起后缩回到自动拉高前的高度 */
export function shrinkBack() {
  if (grownFrom === null) return;
  const h = grownFrom;
  grownFrom = null;
  animateHeight(h);
}

/** 用户手动拖动窗口：停掉动画，以用户的尺寸为准 */
export function manualResize(width: number, height: number) {
  stop();
  grownFrom = null;
  send({ type: "resize", width, height });
}
