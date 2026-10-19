// 与主线程通信。

import type { MainToUi, UiToMain } from "../shared/messages";

export function send(msg: UiToMain, transfer?: Transferable[]) {
  parent.postMessage({ pluginMessage: msg }, "*", transfer);
}

type Listener = (msg: MainToUi) => void;
const listeners = new Set<Listener>();

window.addEventListener("message", (e: MessageEvent) => {
  const msg = e.data?.pluginMessage as MainToUi | undefined;
  if (msg) listeners.forEach((l) => l(msg));
});

export function listen(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** 等待第一条满足条件的消息 */
export function waitFor<T extends MainToUi>(pred: (m: MainToUi) => m is T): Promise<T> {
  return new Promise((resolve) => {
    const off = listen((m) => {
      if (pred(m)) {
        off();
        resolve(m);
      }
    });
  });
}
