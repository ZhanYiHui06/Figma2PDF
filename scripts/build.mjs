// 构建：dist/code.js（插件主线程）+ dist/ui.html（界面，JS/CSS/Worker 全部内联）。
import * as esbuild from "esbuild";
import { deflateSync } from "fflate";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const watch = process.argv.includes("--watch");
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const dist = path.join(root, "dist");
await mkdir(dist, { recursive: true });

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
// 版本号只在 package.json 里维护，构建时注入界面
const common = { define: { __VERSION__: JSON.stringify(pkg.version) }, bundle: true, minify: true, legalComments: "none", logLevel: "warning", charset: "utf8" };

// gs.js 是给 Node 和浏览器共用的 Emscripten 胶水：Node 分支里的 import("module") 不会在浏览器执行
const gsShim = {
  name: "gs-shim",
  setup(build) {
    build.onResolve({ filter: /^module$/ }, () => ({ path: "module", external: true }));
  },
};

/** import x from "worker-source:./file.ts" → 把 Worker 单独打包成字符串 */
const workerSource = {
  name: "worker-source",
  setup(build) {
    build.onResolve({ filter: /^worker-source:/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path.slice("worker-source:".length)),
      namespace: "worker-source",
    }));
    build.onLoad({ filter: /.*/, namespace: "worker-source" }, async (args) => {
      const r = await esbuild.build({ ...common, entryPoints: [args.path], write: false, format: "iife", platform: "browser", target: "es2020", plugins: [gsShim] });
      return { contents: `export default ${JSON.stringify(r.outputFiles[0].text)};`, loader: "js" };
    });
  },
};

/** import x from "icc-deflate:../profiles/a.icc" → 构建时 deflate 压缩（无时间戳，输出稳定），以 Uint8Array 内联 */
const iccDeflate = {
  name: "icc-deflate",
  setup(build) {
    build.onResolve({ filter: /^icc-deflate:/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path.slice("icc-deflate:".length)),
      namespace: "icc-deflate",
    }));
    build.onLoad({ filter: /.*/, namespace: "icc-deflate" }, async (args) => ({
      contents: deflateSync(new Uint8Array(await readFile(args.path)), { level: 9 }),
      loader: "binary",
      watchFiles: [args.path],
    }));
  },
};

async function buildCode() {
  await esbuild.build({ ...common, entryPoints: [path.join(root, "src/main/code.ts")], outfile: path.join(dist, "code.js"), format: "iife", target: "es2017" });
}

async function buildUi() {
  const r = await esbuild.build({
    ...common,
    entryPoints: [path.join(root, "src/ui/index.tsx")],
    write: false,
    outdir: dist,
    format: "iife",
    platform: "browser",
    target: "es2020",
    jsx: "automatic",
    jsxImportSource: "preact",
    plugins: [workerSource, gsShim, iccDeflate],
  });
  const js = r.outputFiles.find((f) => f.path.endsWith(".js")).text;
  const css = r.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
  const html = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8" /><style>${css}</style></head>
<body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body>
</html>
`;
  await writeFile(path.join(dist, "ui.html"), html);
}

async function buildAll() {
  const t = Date.now();
  await Promise.all([buildCode(), buildUi()]);
  const size = (await readFile(path.join(dist, "ui.html"))).length;
  console.log(`built in ${Date.now() - t}ms · ui.html ${(size / 1024).toFixed(0)} KB`);
}

await buildAll();

if (watch) {
  const { watch: fsWatch } = await import("node:fs");
  let timer;
  fsWatch(path.join(root, "src"), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => buildAll().catch((e) => console.error(e.message)), 100);
  });
  console.log("watching src/ …");
}
