// ICC 导入（校验、去重、压缩）与读取。数据存在主线程的 clientStorage，上限 5MB。

import { gunzipSync, gzipSync } from "fflate";
import { checkIcc } from "../lib/icc";
import { sha256 } from "../lib/sha256";
import type { IccEntry } from "../shared/messages";
import { send, waitFor } from "./bridge";

export const STORAGE_LIMIT = 5 * 1024 * 1024;
/** 给设置等其他数据留一点余量 */
const ICC_BUDGET = STORAGE_LIMIT - 64 * 1024;

export const BUILTIN_ICC: IccEntry = { id: "builtin", name: "通用 CMYK（近似 SWOP）", size: 0, stored: 0, importedAt: 0 };

export const usedBytes = (iccs: IccEntry[]) => iccs.reduce((s, e) => s + e.stored, 0);

export type ImportResult = { ok: true; entry: IccEntry } | { ok: false; reason: string };

export async function importIcc(file: File, existing: IccEntry[]): Promise<ImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkIcc(bytes, file.name);
  if (!check.ok) return { ok: false, reason: check.reason };
  const id = (await sha256(bytes)).slice(0, 24);
  const dup = existing.find((e) => e.id === id);
  if (dup) return { ok: false, reason: `「${dup.name}」已经导入过了。` };
  const packed = gzipSync(bytes, { level: 9 });
  if (usedBytes(existing) + packed.length > ICC_BUDGET) {
    return { ok: false, reason: "本地空间不够了，请先删除不用的配置文件再导入。" };
  }
  const entry: IccEntry = { id, name: check.info.name, size: bytes.length, stored: packed.length, importedAt: Date.now() };
  send({ type: "icc-import", entry, data: packed });
  return { ok: true, entry };
}

let reqId = 0;
export async function loadIccData(id: string): Promise<Uint8Array> {
  const requestId = ++reqId;
  const wait = waitFor((m): m is Extract<typeof m, { type: "icc-data" }> => m.type === "icc-data" && m.requestId === requestId);
  send({ type: "icc-load", id, requestId });
  const { data } = await wait;
  if (!data) throw new Error("找不到这个 ICC 配置文件，请重新导入。");
  return gunzipSync(data);
}
