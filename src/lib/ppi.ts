// 图片有效分辨率（PRD F6）：按 scaleMode 和实际变换计算每个图片像素在页面上占多少 pt。

export type ScaleMode = "FILL" | "FIT" | "CROP" | "TILE";

export interface ImagePlacement {
  /** 节点在页面上的显示尺寸（pt，已含祖先缩放） */
  nodeW: number;
  nodeH: number;
  /** 原图像素尺寸 */
  imageW: number;
  imageH: number;
  scaleMode: ScaleMode;
  /** CROP 模式的 imageTransform：[[a, b, tx], [c, d, ty]]，把节点归一化坐标映射到图片归一化坐标 */
  imageTransform?: readonly (readonly number[])[];
  /** TILE 模式的 scalingFactor */
  scalingFactor?: number;
}

export const PPI_WARN = 300;
export const PPI_SEVERE = 150;

/** 返回有效 ppi；导出时整页再缩放 pageScale 倍。 */
export function effectivePpi(p: ImagePlacement, pageScale = 1): number {
  const { nodeW, nodeH, imageW, imageH } = p;
  if (imageW <= 0 || imageH <= 0 || nodeW <= 0 || nodeH <= 0) return Infinity;
  let ptPerPx: number;
  switch (p.scaleMode) {
    case "FIT":
      ptPerPx = Math.min(nodeW / imageW, nodeH / imageH);
      break;
    case "TILE":
      ptPerPx = p.scalingFactor && p.scalingFactor > 0 ? p.scalingFactor : 1;
      break;
    case "CROP": {
      const t = p.imageTransform;
      // 可见部分占原图的比例 = 变换矩阵列向量的长度
      const fx = t ? Math.hypot(t[0][0], t[1][0]) : 1;
      const fy = t ? Math.hypot(t[0][1], t[1][1]) : 1;
      const sx = nodeW / (Math.max(fx, 1e-6) * imageW);
      const sy = nodeH / (Math.max(fy, 1e-6) * imageH);
      ptPerPx = Math.max(sx, sy);
      break;
    }
    case "FILL":
    default:
      ptPerPx = Math.max(nodeW / imageW, nodeH / imageH);
  }
  return 72 / (ptPerPx * pageScale);
}

export function ppiLevel(ppi: number): "ok" | "warn" | "severe" {
  if (ppi < PPI_SEVERE) return "severe";
  if (ppi < PPI_WARN) return "warn";
  return "ok";
}
