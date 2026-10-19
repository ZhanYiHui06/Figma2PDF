// ICC 导入（校验、去重、压缩）与读取。数据存在主线程的 clientStorage，上限 5MB。

import { gunzipSync, gzipSync, inflateSync } from "fflate";
import fogra39 from "icc-deflate:../../profiles/FOGRA39L_coated.icc";
import fogra47 from "icc-deflate:../../profiles/FOGRA47L_uncoated.icc";
import gracolTr006 from "icc-deflate:../../profiles/GRACoL_TR006_coated.icc";
import swopTr005 from "icc-deflate:../../profiles/SWOP_TR005_coated_5.icc";
import { checkIcc } from "../lib/icc";
import { sha256 } from "../lib/sha256";
import type { IccEntry } from "../shared/messages";
import { send, waitFor } from "./bridge";
import { download } from "./engine";

export const STORAGE_LIMIT = 5 * 1024 * 1024;
/** 给设置等其他数据留一点余量 */
const ICC_BUDGET = STORAGE_LIMIT - 64 * 1024;

export const BUILTIN_ICC: IccEntry = { id: "builtin", name: "通用 CMYK（近似 SWOP）", size: 0, stored: 0, importedAt: 0 };

/**
 * 随插件提供的配置文件。来源与许可见 profiles/NOTICE.md。
 * - bundled：colord 项目的 CC0 配置文件，构建时压缩后内联（每个约 95 KB）
 * - remote：许可不允许我们转发，用户选用时直接从 ICC 官方注册库下载，SHA-256 校验
 */
export interface IccPreset extends IccEntry {
  note: string;
  kind: "bundled" | "remote";
  data?: Uint8Array;
  url?: string;
  sha256?: string;
}

const bundled = (id: string, name: string, note: string, data: Uint8Array, size: number): IccPreset => ({ id, name, note, kind: "bundled", data, size, stored: 0, importedAt: 0 });
const REGISTRY = "https://registry.color.org/profile-registry/profiles/";
const remote = (id: string, name: string, note: string, file: string, sha256: string, size: number): IccPreset => ({ id, name, note, kind: "remote", url: REGISTRY + file, sha256, size, stored: 0, importedAt: 0 });

export const ICC_PRESETS: IccPreset[] = [
  bundled("preset:fogra39", "欧洲铜版纸 FOGRA39", "ISO 12647-2 铜版纸，国内印刷厂也常用", fogra39, 122152),
  bundled("preset:fogra47", "欧洲非涂布纸 FOGRA47", "胶版纸、书写纸等非涂布纸", fogra47, 122088),
  bundled("preset:gracol-tr006", "美国铜版纸 GRACoL（TR006）", "北美单张纸铜版印刷", gracolTr006, 122092),
  bundled("preset:swop-tr005", "美国轮转铜版 SWOP（TR005）", "北美杂志轮转印刷", swopTr005, 122072),
  remote("preset:japancolor2011", "日本铜版纸 Japan Color 2011", "日本及部分亚洲印刷厂", "JapanColor2011Coated.icc", "73202ea802e57a63a0be05ed993fde8e4d51cc436120e6c47815ce785ff42916", 1979304),
  remote("preset:pso-coated-v3", "欧洲铜版纸 PSO Coated v3（FOGRA51）", "新版欧洲铜版纸标准", "PSOcoated_v3.icc", "c30ad2c01e8f93135ec7682c535e0a81bc2d177c301e196376c5f5838b5c8e86", 2195228),
  remote("preset:gracol2013", "美国铜版纸 GRACoL 2013（CRPC6）", "新版北美铜版纸标准", "GRACoL2013_CRPC6.icc", "4ebbfad6bc9cfc033fdafdd8ac5df8159208932cb16d9a6596d349ae7ab50443", 3462308),
];

export const presetById = (id: string) => ICC_PRESETS.find((p) => p.id === id);

const remoteCache = new Map<string, Uint8Array>();

/** 选中的远程配置文件这次会话里还没下载过 */
export const needsDownload = (id: string) => presetById(id)?.kind === "remote" && !remoteCache.has(id);

/**
 * 取导出要用的 ICC：内置通用返回 undefined（Ghostscript 自带），
 * 随插件的直接解压，远程的下载并校验，用户导入的从 clientStorage 读。
 */
export async function loadProfile(id: string, onProgress: (received: number, total: number) => void, signal: AbortSignal): Promise<Uint8Array | undefined> {
  if (id === BUILTIN_ICC.id) return undefined;
  const preset = presetById(id);
  if (!preset) return loadIccData(id);
  if (preset.kind === "bundled") return inflateSync(preset.data!);
  const hit = remoteCache.get(id);
  if (hit) return hit;
  let bytes: Uint8Array;
  try {
    bytes = await download(preset.url!, (r) => onProgress(r, preset.size), signal);
  } catch (e) {
    if (signal.aborted) throw e;
    throw new Error(`「${preset.name}」下载失败，请检查网络后重试，或改用随插件提供的配置文件。\n${e instanceof Error ? e.message : String(e)}`);
  }
  if ((await sha256(bytes)) !== preset.sha256) throw new Error(`「${preset.name}」校验不通过：ICC 注册库上的文件可能已经更新。请改用其他配置文件，并告诉我们。`);
  remoteCache.set(id, bytes);
  return bytes;
}

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
