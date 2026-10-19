// 把合并后的 PDF 交给 Ghostscript 转 CMYK。优先在 Worker 里跑；Worker 建不起来就在当前线程跑。

import workerSource from "worker-source:./gs-worker.ts";
import { ICC_UNUSABLE } from "../lib/gs";
import type { GsWorkerRequest, GsWorkerResponse } from "./gs-worker";

export interface ConvertHandle {
  promise: Promise<Uint8Array>;
  cancel: () => void;
}

function createWorker(): Worker | null {
  try {
    const url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    return w;
  } catch {
    return null;
  }
}

export function convertToCmyk(req: GsWorkerRequest, onPage: (page: number) => void): ConvertHandle {
  const worker = createWorker();
  if (!worker) {
    let cancelled = false;
    const promise = import("../lib/gs").then(async ({ runGs, probeIcc }) => {
      if (req.icc && !(await probeIcc(req.wasm, req.icc))) throw new Error(ICC_UNUSABLE);
      const r = await runGs(req.wasm, { pdf: req.pdf, icc: req.icc }, onPage);
      if (cancelled) throw new Error("cancelled");
      return r.pdf;
    });
    return { promise, cancel: () => (cancelled = true) };
  }
  let reject: (e: Error) => void = () => undefined;
  const promise = new Promise<Uint8Array>((resolve, rej) => {
    reject = rej;
    worker.onmessage = (e: MessageEvent<GsWorkerResponse>) => {
      const m = e.data;
      if (m.type === "page") onPage(m.page);
      else if (m.type === "done") {
        worker.terminate();
        resolve(m.pdf);
      } else {
        worker.terminate();
        rej(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      rej(new Error(e.message || "色彩转换线程出错"));
    };
    worker.postMessage(req);
  });
  return {
    promise,
    cancel: () => {
      worker.terminate();
      reject(new Error("cancelled"));
    },
  };
}
