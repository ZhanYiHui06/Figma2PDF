// 色彩引擎：在线下载 gs.wasm（jsDelivr 主、unpkg 备），SHA-256 校验通过才使用。

import { sha256 } from "../lib/sha256";

export const GS_VERSION = "1.1.0";
export const GS_WASM_SHA256 = "e8aaf3af75da65fe0af8d49b30fa717e4ff13eedbbdc0cdd5700f54fb8f667e6";
export const GS_WASM_BYTES = 15533045;
export const GS_SOURCES = [
  `https://cdn.jsdelivr.net/npm/@okathira/ghostpdl-wasm@${GS_VERSION}/dist/gs.wasm`,
  `https://unpkg.com/@okathira/ghostpdl-wasm@${GS_VERSION}/dist/gs.wasm`,
];

let cached: Uint8Array | null = null;

export const engineReady = () => cached !== null;

export async function download(url: string, onProgress: (received: number) => void, signal: AbortSignal): Promise<Uint8Array> {
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received);
  }
  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** 下载并校验引擎；同一会话只下载一次。 */
export async function loadEngine(onProgress: (received: number, total: number) => void, signal: AbortSignal): Promise<Uint8Array> {
  if (cached) return cached;
  const errors: string[] = [];
  for (const url of GS_SOURCES) {
    try {
      const bytes = await download(url, (r) => onProgress(r, GS_WASM_BYTES), signal);
      const hash = await sha256(bytes);
      if (hash !== GS_WASM_SHA256) {
        errors.push(`${new URL(url).host}：文件校验不通过`);
        continue;
      }
      cached = bytes;
      return bytes;
    } catch (e) {
      if (signal.aborted) throw e;
      errors.push(`${new URL(url).host}：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`色彩引擎下载失败，请检查网络后重试。\n${errors.join("\n")}`);
}
