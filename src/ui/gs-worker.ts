// Web Worker：在后台线程跑 Ghostscript，界面不卡，取消时直接 terminate。

import { ICC_UNUSABLE, probeIcc, runGs } from "../lib/gs";

export interface GsWorkerRequest {
  wasm: Uint8Array;
  pdf: Uint8Array;
  icc?: Uint8Array;
}

export type GsWorkerResponse =
  | { type: "page"; page: number }
  | { type: "done"; pdf: Uint8Array }
  | { type: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<GsWorkerRequest>) => {
  const { wasm, pdf, icc } = e.data;
  try {
    if (icc && !(await probeIcc(wasm, icc))) throw new Error(ICC_UNUSABLE);
    const r = await runGs(wasm, { pdf, icc }, (page) => ctx.postMessage({ type: "page", page } satisfies GsWorkerResponse));
    ctx.postMessage({ type: "done", pdf: r.pdf } satisfies GsWorkerResponse, [r.pdf.buffer]);
  } catch (err) {
    ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) } satisfies GsWorkerResponse);
  }
};
