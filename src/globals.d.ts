declare const __html__: string;
/** package.json 里的版本号，构建时注入 */
declare const __VERSION__: string;
/** import x from "icc-deflate:path.icc" → 构建时用 deflate 压缩后内联的 ICC 文件 */
declare module "icc-deflate:*" {
  const data: Uint8Array;
  export default data;
}
declare module "worker-source:*" {
  const code: string;
  export default code;
}
