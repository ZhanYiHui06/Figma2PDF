// ICC 配置文件校验与名称读取（PRD F4）。

export interface IccInfo {
  name: string;
  colorSpace: string;
  deviceClass: string;
  version: number;
}

export type IccCheck =
  | { ok: true; info: IccInfo }
  | { ok: false; reason: string; info?: IccInfo };

const sig = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];

export function readIccInfo(bytes: Uint8Array): IccInfo | null {
  if (bytes.length < 132 || sig(bytes, 36) !== "acsp") return null;
  const deviceClass = sig(bytes, 12).trim();
  const colorSpace = sig(bytes, 16).trim();
  const version = bytes[8];
  return { name: readDesc(bytes) ?? "", colorSpace, deviceClass, version };
}

function readDesc(b: Uint8Array): string | null {
  const count = u32(b, 128);
  for (let i = 0; i < count && 132 + i * 12 + 12 <= b.length; i++) {
    const e = 132 + i * 12;
    if (sig(b, e) !== "desc") continue;
    const off = u32(b, e + 4);
    const size = u32(b, e + 8);
    if (off + size > b.length || size < 12) return null;
    const type = sig(b, off);
    if (type === "desc") {
      // v2 textDescriptionType：ASCII 计数（含结尾 0）+ 字符串
      const n = u32(b, off + 8);
      let s = "";
      for (let k = 0; k < n - 1 && off + 12 + k < off + size; k++) s += String.fromCharCode(b[off + 12 + k]);
      return s.trim() || null;
    }
    if (type === "mluc") {
      // v4 multiLocalizedUnicodeType：优先中文，其次英文，否则第一条
      const records = u32(b, off + 8);
      const recSize = u32(b, off + 12);
      let pick = -1;
      let pickScore = -1;
      for (let r = 0; r < records; r++) {
        const ro = off + 16 + r * recSize;
        const lang = String.fromCharCode(b[ro], b[ro + 1]);
        const score = lang === "zh" ? 2 : lang === "en" ? 1 : 0;
        if (score > pickScore) {
          pickScore = score;
          pick = ro;
        }
      }
      if (pick < 0) return null;
      const len = u32(b, pick + 4);
      const so = off + u32(b, pick + 8);
      let s = "";
      for (let k = 0; k + 1 < len && so + k + 1 < b.length; k += 2) s += String.fromCharCode(u16(b, so + k));
      return s.replace(/\0+$/, "").trim() || null;
    }
    return null;
  }
  return null;
}

const SPACE_LABEL: Record<string, string> = { RGB: "RGB", GRAY: "灰度", Lab: "Lab", CMYK: "CMYK" };
const CLASS_LABEL: Record<string, string> = { mntr: "显示器", scnr: "扫描仪", prtr: "输出设备", link: "设备链接", spac: "色彩空间", abst: "抽象", nmcl: "命名颜色" };

export function checkIcc(bytes: Uint8Array, fileName: string): IccCheck {
  const info = readIccInfo(bytes);
  const shown = `「${fileName}」`;
  if (!info) return { ok: false, reason: `${shown}不是有效的 ICC 配置文件，未导入。` };
  if (info.colorSpace !== "CMYK") {
    const space = SPACE_LABEL[info.colorSpace] ?? info.colorSpace;
    const cls = CLASS_LABEL[info.deviceClass] ?? "";
    return { ok: false, info, reason: `${shown}是 ${space} ${cls}配置文件，不能用于 CMYK 导出，未导入。` };
  }
  if (info.deviceClass !== "prtr") {
    const cls = CLASS_LABEL[info.deviceClass] ?? info.deviceClass;
    return { ok: false, info, reason: `${shown}是${cls}类配置文件，不是印刷输出配置，未导入。` };
  }
  if (!info.name) info.name = fileName.replace(/\.(icc|icm)$/i, "");
  return { ok: true, info };
}
