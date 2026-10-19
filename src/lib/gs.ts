// Ghostscript WASM：RGB → CMYK。JS 胶水代码随插件打包，只在线下载 gs.wasm（见 engine.ts）。

import loadGs from "@okathira/ghostpdl-wasm";

export interface GsJob {
  pdf: Uint8Array;
  /** 用户导入的 ICC；不传则用 Ghostscript 内置的 default_cmyk.icc（Artifex CMYK SWOP） */
  icc?: Uint8Array;
}

export interface GsResult {
  pdf: Uint8Array;
  log: string;
}

export function gsArgs(hasCustomIcc: boolean): string[] {
  const profile = hasCustomIcc ? "/profile.icc" : "default_cmyk.icc";
  return [
    "-dNOPAUSE",
    "-dBATCH",
    "-dSAFER",
    "-sDEVICE=pdfwrite",
    "-dAutoRotatePages=/None",
    "-sColorConversionStrategy=CMYK",
    "-sProcessColorModel=DeviceCMYK",
    `-sOutputICCProfile=${profile}`,
    ...(hasCustomIcc ? ["--permit-file-read=/profile.icc"] : []),
    // 转换颜色时 gs 会重新压缩图片：关掉自动选择和降采样，JPEG 用高质量
    "-dAutoFilterColorImages=false",
    "-dColorImageFilter=/DCTEncode",
    "-dDownsampleColorImages=false",
    "-dDownsampleGrayImages=false",
    "-dDownsampleMonoImages=false",
    "-sOutputFile=/out.pdf",
    // QFactor 0.15 + 不做色度抽样 ≈ Acrobat 的“最高”JPEG 质量
    "-c",
    "<< /ColorImageDict << /QFactor 0.15 /Blend 1 /HSamples [1 1 1 1] /VSamples [1 1 1 1] >> /GrayImageDict << /QFactor 0.15 /Blend 1 /HSamples [1 1 1 1] /VSamples [1 1 1 1] >> >> setdistillerparams",
    "-f",
    "/in.pdf",
  ];
}

let compiled: Promise<WebAssembly.Module> | null = null;

export async function runGs(wasm: ArrayBuffer | Uint8Array, job: GsJob, onPage?: (page: number) => void): Promise<GsResult> {
  compiled ??= WebAssembly.compile(wasm instanceof Uint8Array ? (wasm.slice().buffer as ArrayBuffer) : wasm);
  const mod = await compiled;
  let log = "";
  const gs = await loadGs({
    print: (s: string) => {
      log += s + "\n";
      const m = /^Page (\d+)/.exec(s);
      if (m && onPage) onPage(Number(m[1]));
    },
    printErr: (s: string) => (log += s + "\n"),
    locateFile: (p: string) => p,
    instantiateWasm: (imports: WebAssembly.Imports, done: (i: WebAssembly.Instance) => void) => {
      WebAssembly.instantiate(mod, imports).then((inst) => done(inst));
      return {};
    },
  } as never);
  gs.FS.writeFile("/in.pdf", job.pdf);
  if (job.icc) gs.FS.writeFile("/profile.icc", job.icc);
  const rc = gs.callMain(gsArgs(!!job.icc));
  if (rc !== 0) throw new Error(`Ghostscript 转换失败（代码 ${rc}）\n${log.slice(-800)}`);
  return { pdf: gs.FS.readFile("/out.pdf"), log };
}

export const ICC_UNUSABLE = "色彩引擎读不了这个 ICC 配置文件。请换一个配置文件，或改用内置的「Artifex CMYK SWOP」。";

const REPAIRED = /errors were encountered|had errors that were repaired/;

/**
 * ICC 读不出来时 Ghostscript 不会失败，只会悄悄换回默认配置并在日志里报错。
 * 先用一页小 PDF 试转一次，日志干净才算可用。
 */
export async function probeIcc(wasm: ArrayBuffer | Uint8Array, icc: Uint8Array): Promise<boolean> {
  try {
    const { log } = await runGs(wasm, { pdf: tinyPdf(), icc });
    return !REPAIRED.test(log);
  } catch {
    return false;
  }
}

/** 一页 72pt、带一个红色方块的最小 PDF（手写，避免 Worker 里再打包一份 pdf-lib）。 */
export function tinyPdf(): Uint8Array {
  const content = "1 0 0 rg 0 0 36 36 re f";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Contents 4 0 R /Resources << >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
